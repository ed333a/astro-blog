module spi_master #(
    parameter                       DATA_WIDTH          = 5'd24             , // data width, [1bit RW ctrl, 15 bits register addr, 8 bits data]
    parameter                       CPOL                = 1'b0              , // Clock polarity
    parameter                       CPHA                = 1'b0              , // Clock phase
    parameter                       CLK_DIV             = 8'd10             , // input clk division, used to generate SCLK.
    parameter                       MOSI_IDLE_STATE     = 1'b0              , // when module goes to idle. the MOSI line logic level will be set to this value   
    parameter                       CONTINUOUS_CLK      = 1'b0                // when set to 1'b1, the SCLK line will continouous or only toggle when cs is low logic if it sets to 1'b0.
)(
    input                           clk                                     , // module clock
    input                           rst_n                                   , // module reset signal, active low

    input       [DATA_WIDTH-1:0]    dat_tx                                  , // the data to be transmitted to slave device
    output  reg [DATA_WIDTH-1:0]    dat_rx                                  , // the data received from the slave device

    input                           start_op                                , // pulse, trigger transfer dat operation
    output  reg                     spi_end                                 , // signal is high when transferring data
    output  reg                     spi_busy                                , // active-high busy signal
    // PHY signals      
    output                          spi_sclk                                , // serial clock
    output  reg                     spi_cs_n                                , // chip select signal, active low
    input                           spi_miso                                , // master in slave out
    output  reg                     spi_mosi                                , // master out slave in
    output  reg [7:0           ]    data_bit_cnt                              // bit transmit counter
);

// NOTE_HEADER--------------------------------------------------------------------------------------
// SPI Modes | CPOL             | CPHA          | Note
//           | (Clock Polarity) | (Clock Phase) | 
// ==========+==================+===============+===================================================
//         0 |                0 |             0 | Clock low  level when idle, data sampled on rising  edge
//         1 |                0 |             1 | Clock low  level when idle, data sampled on falling edge
//         2 |                1 |             0 | Clock high level when idle, data sampled on rising  edge
//         3 |                1 |             1 | Clock high level when idle, data sampled on falling edge
// NOTE_FOOTER--------------------------------------------------------------------------------------

//================================================================================
// local parameter declarations
//================================================================================

//================================================================================
// reg declarations
//================================================================================
reg [DATA_WIDTH-1:0 ]       data_tx_buffer              ; // tx data buffer, shift out to mosi
reg [DATA_WIDTH-1:0 ]       data_rx_buffer              ; // rx data buffer, shift in from miso
reg [7:0            ]       clk_cnt                     ; // a counter for frequency division

reg                         spi_sclk_inv                ; // This signal is a pulse signal with a clk period, and on its rising edge, the SCLK signal will invert once.
reg                         spi_sclk_internal           ; // internal serial clock divied from module clock

reg                         trans_end_d                 ;
reg                         trans_start                 ;
reg                         spi_start_op_d0             ;
reg                         spi_start_op_d1             ;
// reg                         spi_busy                    ; // internal busy signal
//================================================================================
// wire declarations
//================================================================================
wire    spi_sclk_negedge    =   spi_sclk_internal & spi_sclk_inv                ; // pulse signal, indicates SCLK negedge
wire    spi_sclk_posedge    =  !spi_sclk_internal & spi_sclk_inv                ;
wire    update_edge         = (CPHA == 0) ? spi_sclk_negedge : spi_sclk_posedge ; // Select update and sample edges based on CPHA
wire    sample_edge         = (CPHA == 0) ? spi_sclk_posedge : spi_sclk_negedge ;

wire    spi_start_op_pulse                                          ;

//================================================================================
// assign declarations
//================================================================================
assign  spi_start_op_pulse  =   !spi_start_op_d0 & spi_start_op_d1  ;

//================================================================================
// MAIN CODE
//================================================================================

// sync start_op signal
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        spi_start_op_d0 <=  1'b0            ;
        spi_start_op_d1 <=  1'b0            ;
    end else begin
        spi_start_op_d0 <=  start_op        ;
        spi_start_op_d1 <=  spi_start_op_d0 ;
    end
end

// spi busy indicator
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        spi_busy    <=  1'b0                ;
    end else if (spi_start_op_pulse) begin
        spi_busy    <=  1'b1                ;
    end else if (spi_end) begin
        spi_busy    <=  1'b0                ;
    end else begin
        spi_busy    <=  spi_busy            ;
    end
end

// REGION_HEADER------------------------------------------------------------------------------------
// generate spi_sclk_inv signal
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        clk_cnt         <=  8'd0                    ;
        spi_sclk_inv     <=  1'b0                   ;
    end
    else if (clk_cnt == CLK_DIV - 1'b1) begin
        clk_cnt         <=  8'd0                    ;
        spi_sclk_inv     <=  1'b1                   ;
    end
    else if (clk_cnt == CLK_DIV[7:1] - 1'b1) begin
        clk_cnt         <=  clk_cnt + 1'b1          ;
        spi_sclk_inv     <=  1'b1                   ;
    end
    else begin
        clk_cnt         <=  clk_cnt + 1'b1          ;
        spi_sclk_inv     <=  1'b0                   ;
    end
end

// generate spi_sclk_internal signal
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        spi_sclk_internal   <=  1'b0                ;
    end else if (spi_sclk_inv) begin
        spi_sclk_internal   <=  !spi_sclk_internal  ;
    end else begin
        spi_sclk_internal   <=   spi_sclk_internal  ;
    end
end

// assign continouous clock
generate
    if (CONTINUOUS_CLK == 1'b1)
        assign spi_sclk = spi_sclk_internal ^ CPOL                                  ;
    else
        assign spi_sclk = (spi_cs_n == 1'b1) ? CPOL : (spi_sclk_internal ^ CPOL)    ;
endgenerate
// REGION_FOOTER------------------------------------------------------------------------------------

// count data bit
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        data_bit_cnt    <=  8'd0                            ;
    end 
    else if (
        spi_busy        && 
        update_edge     && 
        (data_bit_cnt  < DATA_WIDTH)
    ) begin
        data_bit_cnt    <=  data_bit_cnt + 1'b1             ;
    end else if (update_edge && data_bit_cnt == DATA_WIDTH) begin
        data_bit_cnt    <=  8'd0                            ;
    end else begin
        data_bit_cnt    <=  data_bit_cnt                    ;
    end
end

// send data
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        spi_mosi        <=  MOSI_IDLE_STATE                 ;
        data_tx_buffer  <=  {DATA_WIDTH{1'b0}}              ;
    end else if (spi_start_op_pulse) begin
        data_tx_buffer  <=  dat_tx                          ;
    end 
    else if (
        spi_busy                        &&
        update_edge                     &&
        (data_bit_cnt < DATA_WIDTH)
    ) begin
        spi_mosi        <=  data_tx_buffer[DATA_WIDTH-1]    ;   // output data, MSB First
        data_tx_buffer  <=  {                                   // left-shift data
            data_tx_buffer[DATA_WIDTH-2:0]  ,
            data_tx_buffer[DATA_WIDTH-1]     
        };
    end else if (
        spi_busy                        &&
        update_edge                     &&
        (data_bit_cnt >= DATA_WIDTH)
    ) begin
        spi_mosi        <=  MOSI_IDLE_STATE                 ;
        data_tx_buffer  <=  {DATA_WIDTH{1'b0}}              ;
    end
end

// receive data
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        data_rx_buffer      <=  {DATA_WIDTH{1'b0}}  ;
    end else if (spi_cs_n == 1'b0 && sample_edge) begin
        data_rx_buffer[0]   <=  spi_miso            ;   // sample data
        data_rx_buffer[DATA_WIDTH-1:1] <= data_rx_buffer[DATA_WIDTH-2:0];   // right-shif in sampled data to buffer
    end else begin
        data_rx_buffer      <=  data_rx_buffer      ;
    end
end

// move data from data_rx_buffer to data_rx output and generate spi_end signal 
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        spi_end <=  1'b0                ;
        dat_rx  <=  {DATA_WIDTH{1'b0}}  ;
    end else if (update_edge && (data_bit_cnt == DATA_WIDTH)) begin
        spi_end <=  1'b1                ;
        dat_rx  <=  data_rx_buffer      ;
    end else begin
        spi_end <=  1'b0                ;
    end
end

always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        trans_end_d <=  1'b0            ;
    end else begin
        trans_end_d <=  spi_end         ;
    end
end

always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        trans_start <=  1'b0            ;
    end else if (spi_busy & update_edge) begin
        trans_start <=  1'b1            ;
    end else begin
        trans_start <=  1'b0            ;
    end
end

always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        spi_cs_n <=  1'b1               ;
    end else if (trans_start) begin
        spi_cs_n <=  1'b0               ;
    end else if (trans_end_d) begin // used a extended version to meet the timing requirements(clock to enable low time) of some device
        spi_cs_n <=  1'b1               ;
    end
end

endmodule
