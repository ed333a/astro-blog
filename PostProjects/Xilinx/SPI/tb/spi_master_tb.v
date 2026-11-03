`timescale 1ns/1ps

module spi_master_tb;

// 产生 100MHz 的时钟
localparam CLOCK_PERIOD = 10;

reg clk;
initial clk = 0;
always #(CLOCK_PERIOD/2) clk=~clk;

reg             rst_n           ;
reg     [23:0]  dat_tx          ;
wire    [23:0]  dat_rx          ;
reg             start_op        ;
wire            spi_end         ;
wire            spi_sclk        ;
wire            spi_cs_n        ;
reg             spi_miso        ;
wire            spi_mosi        ;
wire    [ 7:0]  data_bit_cnt    ;

initial begin
    rst_n       <=  1'b0        ;
    dat_tx      <=  24'h79BC    ;   //  待发送数据
    start_op    <=  1'b0        ;
    spi_miso    <=  1'b0        ;
    #(CLOCK_PERIOD*10)
    rst_n       <=  1'b1        ;   //  释放复位信号
    #(CLOCK_PERIOD*10)
    start_op    <=  1'b1        ;   //  等待 10 个时钟周期后触发发送信号
    #CLOCK_PERIOD
    start_op    <=  1'b0        ;   //  释放发送信号

end

//  实例例化
spi_master # (
    .DATA_WIDTH         (   8'd24   ),
    .CPOL               (   1'b0    ),
    .CPHA               (   1'b0    ),
    .CLK_DIV            (   8'd10   ),  // 输入的 100MHz 时钟进行 10 分频, 得到 10MHz 的 SPI 时钟
    .MOSI_IDLE_STATE    (   1'b0    ), 
    .CONTINUOUS_CLK     (   1'b0    )
) dut (
    .clk                (   clk             ),
    .rst_n              (   rst_n           ),
    .dat_tx             (   dat_tx          ),
    .dat_rx             (   dat_rx          ),
    .start_op           (   start_op        ),
    .spi_end            (   spi_end         ),
    .spi_sclk           (   spi_sclk        ),
    .spi_cs_n           (   spi_cs_n        ),
    .spi_miso           (   spi_miso        ),
    .spi_mosi           (   spi_mosi        ),
    .data_bit_cnt       (   data_bit_cnt    )
);
    
endmodule
