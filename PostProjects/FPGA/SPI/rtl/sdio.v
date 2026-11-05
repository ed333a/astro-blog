module sdio_interface (
    input   wire            clk             ,   //  模块的时钟信号
    input   wire            rst_n           ,   //  模块的复位信号，低电平有效
    
    input   wire            rh_wl           ,   //  读写控制信号, 读为高电平，写为低电平
    input   wire            sdio_start_op   ,   //  操作使能的脉冲信号
    input   wire    [14:00] register_addr   ,   //  15 位寄存器地址
    input   wire    [07:00] dat_tx          ,   //  要发送的数据
    output  wire    [07:00] dat_rx          ,   //  从 sdio 接口读取到的 8 位寄存器数据
    
    output  wire            spi_sclk        ,   //  串行时钟信号
    output  wire            spi_cs_n        ,   //  片选信号
    inout   wire            sdio                //  双向 IO 端口
);

// 例化 spi_master 模块
wire            spi_mosi    ;
wire            spi_miso    ;
wire    [23:00] dat_rx_t    ;   //  将 spi_master 模块接收到的 24 位数据暂存到此处，我们只需要低八位的寄存器数据
wire    [07:00] data_bit_cnt;
wire    sdio_dir = (data_bit_cnt <= 16) ? 1'b0 : rh_wl; // 前 16 位：读写控制位和寄存器地址，固定为输出方向，低 8 位根据读写控制来调整方向
assign  dat_rx  =   dat_rx_t[07:00] ;   //  只取出低八位数据
spi_master # (
    .DATA_WIDTH             (   24                              ),  // data width, [1bit RW ctrl, 15 bits register addr, 8 bits data]
    .CPOL                   (   1'b0                            ),  // Clock polarity
    .CPHA                   (   1'b0                            ),  // Clock phase
    .CLK_DIV                (   8'd10                           ),  // input clk division, used to generate SCLK.
    .MOSI_IDLE_STATE        (   1'b0                            ),  // when module goes to idle. the MOSI line logic level will be set to this value   
    .CONTINUOUS_CLK         (   1'b0                            )   // when set to 1'b1, the SCLK line will continouous or only toggle when cs is low logic if it sets to 1'b0.
) spi_master (                   
    .clk                    (   clk                             ),  // [I] [      ] module clock
    .rst_n                  (   rst_n                           ),  // [I] [      ] module reset signal, active-low

    .dat_tx                 (   {rh_wl, register_addr, dat_tx}  ),  // [I] [DW-1:0] the data to be transmitted to slave device
    .dat_rx                 (   dat_rx                          ),  // [O] [DW-1:0] the data received from the slave device

    .start_op               (   sdio_start_op                   ),  // [I] [      ] pulse, trigger SPI transfer
    .spi_end                (   spi_end                         ),  // [O] [      ] busy is high level when transferring data

    .spi_sclk               (   spi_sclk                        ),  // [O] [   0:0] serial clock
    .spi_cs_n               (   spi_cs_n                        ),  // [O] [   0:0] chip select signal, active low
    .spi_mosi               (   spi_mosi                        ),  // [I] [   0:0] master in slave out
    .spi_miso               (   spi_miso                        ),  // [O] [   0:0] master out slave in
    .data_bit_cnt           (   data_bit_cnt                    )   // [O] [   7:0] bit transmit counter
);

// 例化 IOBUF 原语
IOBUF # (
    .DRIVE          (   12              ),
    .IBUF_LOW_PWR   (   "TRUE"          ),
    .IOSTANDARD     (   "DEFAULT"       ),
    .SLEW           (   "SLOW"          )
) spi_iobuf (
    .O              (   spi_miso        ),  //  IOBUF 原语的输出端口，接到 spi_miso 中
    .IO             (   sdio            ),  //  IOBUF 原语的双向端口，输出到模块端口
    .I              (   spi_mosi        ),  //  IOBUF 原语的输入端口，接到 spi_mosi 中
    .T              (   sdio_dir        )   //  IOBUF 原语的方向控制端口，low: output, high: input
);

endmodule
