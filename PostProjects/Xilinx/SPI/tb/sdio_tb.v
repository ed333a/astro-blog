`timescale 1ns/1ps

module sdio_tb;

// 产生 100MHz 的时钟
localparam CLOCK_PERIOD = 10;

reg clk;
initial clk = 0;
always #(CLOCK_PERIOD/2) clk=~clk;

reg             rst_n           ;
reg             rh_wl           ;
reg     [14:00] register_addr   ;
reg     [07:00] dat_tx          ;
wire    [07:00] dat_rx          ;
reg             start_op        ;
wire            spi_end         ;
wire            spi_sclk        ;
wire            spi_cs_n        ;
wire            sdio            ;

wire    [07:00] data_bit_cnt    ;

initial begin
    //  初始化寄存器值
    rst_n           <=  1'b0    ;
    rh_wl           <=  1'b0    ;
    register_addr   <=  15'b0   ;
    dat_tx          <=  8'b0    ; 
    start_op        <=  1'b0    ;
    #(CLOCK_PERIOD*10)
    rst_n           <=  1'b1    ;   //  释放复位信号

    @(posedge clk);
    #(CLOCK_PERIOD*10)  // 等待 10 个时钟周期后 开始准备数据
    rh_wl           <=  1'b1    ;   //  读操作
    register_addr   <=  15'h53BA;   //  寄存器地址
    dat_tx          <=  8'b0    ;   //  读操作下 dat_tx 无作用, 直接写 0
    #(CLOCK_PERIOD*10)
    start_op        <=  1'b1    ;   //  等待 10 个时钟周期后触发发送信号
    #CLOCK_PERIOD
    start_op        <=  1'b0    ;   //  释放发送信号
    
    #3000; // 等待 spi 发送完成

    @(posedge clk);
    #(CLOCK_PERIOD*10)  // 等待 10 个时钟周期后 开始准备数据
    rh_wl           <=  1'b0    ;   //  写操作
    register_addr   <=  15'h53BC;   //  寄存器地址
    dat_tx          <=  8'h9A   ;   //  写入的数据
    #(CLOCK_PERIOD*10)
    start_op    <=  1'b1        ;   //  等待 10 个时钟周期后触发发送信号
    #CLOCK_PERIOD
    start_op    <=  1'b0        ;   //  释放发送信号

end

//  实例例化
sdio_interface dut(
    .clk            (   clk             ),
    .rst_n          (   rst_n           ),
    .rh_wl          (   rh_wl           ),
    .sdio_start_op  (   start_op        ),
    .register_addr  (   register_addr   ),
    .dat_tx         (   dat_tx          ),
    .dat_rx         (   dat_rx          ),

    .spi_sclk       (   spi_sclk        ),
    .spi_cs_n       (   spi_cs_n        ),
    .sdio           (   sdio            )
);
    
endmodule
