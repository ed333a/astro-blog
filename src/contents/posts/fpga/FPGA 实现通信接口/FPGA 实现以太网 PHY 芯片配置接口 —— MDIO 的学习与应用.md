---
title: FPGA 实现以太网 PHY 芯片配置接口 —— MDIO 的学习与应用
published: 2026-04-18 15:18:25
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 经验分享
category: FPGA
postID: 3723985a # 自动生成, 不要修改这个项目的值
---

### 前言
MDIO 接口是配置以太网 PHY 芯片片上寄存器的一种通用接口，几乎所有的以太网 PHY 芯片使用的都是 MDIO 接口来配置寄存器。
### 接线方式
- ETH_MDC: 时钟信号线，频率不大于 12.5MHz
- ETH_MDIO: 双向数据线
主从式、半双工通信，所有通信都是由主设备发起，从设备被动响应（和 IIC 类似）
### 数据帧格式
#### 读数据
| Preamble | ST  |   OP   | PHYAD | REGAD |   TA   |       DATA       | IDLE |
| :------: | :-: | :----: | :---: | :---: | :----: | :--------------: | :--: |
|  1...1   | 01  | **10** | AAAAA | RRRRR | **Z0** | DDDDDDDDDDDDDDDD |  Z   |
- Preamble: 前导码，由主设备发送的**连续的 32 个逻辑 1**，用于与从设备建立同步
- ST: 数据帧的开始，固定为 2位数据 **01**，代表有效数据的起始位置
- OP: 操作码，定义操作类型，**01：写操作，10：读操作**
- PHYAD：**5 位 PHY 芯片地址**，用于选择总线上的目标 PHY 芯片
- REGAD：**片上寄存器地址**
- TA：转向域，2 位的空闲周期，用于读写方向切换；写操作：主设备持续驱动总线输出 "10"; 读操作：第一个时钟周期 MDIO 程高阻态 (主、从设备均释放总线),  在第二个时钟周期下，从设备将接管 MDIO 总线，开始驱动 MDIO 输出数据。
- DATA：16 位即将要写入或读取的数据
- IDLE：空闲状态位，帧结束后 MDIO 总线拉高进入高阻态
表中的 Z 高阻态，在外部上拉电阻的情况下最终信号体现为高电平

> 在读数据操作时，**直到 TA 阶段之前，数均由主设备(FPGA)驱动**，TA 阶段第**一个时钟周期**主设备控制 MDIO 为高阻态，释放总线，从**第二个时钟周期**开始，**从设备接管 MDIO**，数据为低电平，表示数据将在**下一个时钟周期**开始发送。

![MDIO 读数据时序图](/img/posts/fpga_impl_interface/eth_mdio/mdio_reading.png)
![MDIO 读数据时序图-note](/img/posts/fpga_impl_interface/eth_mdio/mdio_reading_note.png)
#### 写数据
| Preamble | ST  |   OP   | PHYAD | REGAD |   TA   |       DATA       | IDLE |
| :------: | :-: | :----: | :---: | :---: | :----: | :--------------: | :--: |
|  1...1   | 01  | **01** | AAAAA | RRRRR | **10** | DDDDDDDDDDDDDDDD |  Z   |

在写数据时，MDIO 总线**全程由主设备控制**
![MDIO 写数据时序图](/img/posts/fpga_impl_interface/eth_mdio/mdio_writing.png)
### 实现代码
#### 双向 IO 口的驱动
在这里使用 `IOBUF` 原语驱动双向 IO 口。
```verilog
IOBUF # (
    .DRIVE          (   12              ),
    .IBUF_LOW_PWR   (   "TRUE"          ),
    .IOSTANDARD     (   "DEFAULT"       ),
    .SLEW           (   "SLOW"          )
) mdio_obuf (
    .O              (   eth_mdio_in     ),
    .IO             (   eth_mdio        ),
    .I              (   eth_mdio_out    ),
    .T              (   eth_mdio_dir    )   //  1'b1: input, 1'b0: output
);
```
或者使用三态门进行逻辑判断。
```verilog
module eth_mdio (
	//...
	inout eth_mdio; // 双向 io 口
	//...
);

wire eth_mdio_in ; // MDIO 从机输入的比特位数据
wire eth_mdio_out; // MDIO 主机输出的比特位数据
reg  eth_mdio_dir; // 控制 MDIO 的输入/输出方向, 1'b1: 输入, 1'b0:输出

assign eth_mdio = eth_mdio_dir ? eth_mdio_in : eth_mdio_out; // 三态门根据内部的 dir 信号控制端口的输入输出方向

//... 其它代码 ... 如时钟信号、驱动 eth_mdio_dir 的逻辑等等
```
#### 时钟信号的产生
和之前有一篇讲 [SPI 通信](./FPGA%20SPI通信) 文章中的代码类似，也是产生一个双边沿的脉冲信号，然后根据这个双边沿脉冲信号去翻转 MDC 信号就得到了驱动时钟。
```verilog
// MDC inv Generation, inv pulse signal is active-high when MDC rising edge and falling edge
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_mdc_cnt <=  32'd0               ;
        eth_mdc_inv <=   1'b0               ;
    end
    else if (eth_mdc_cnt == (CLK_DIV - 1'd1)) begin         // MDC falling edge
        eth_mdc_cnt <=  8'd0                ;
        eth_mdc_inv <=  1'b1                ;
    end
    else if (eth_mdc_cnt == (CLK_DIV[7:1] - 1'd1)) begin    // MDC rising  edge
        eth_mdc_cnt <=  eth_mdc_cnt + 1'd1  ;
        eth_mdc_inv <=   1'b1               ;
    end
    else begin
        eth_mdc_cnt <=  eth_mdc_cnt + 1'd1  ;
        eth_mdc_inv <=  1'b0                ;
    end
end

// generate MDC
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_mdc     <=  1'b0                ;
    end else if (eth_mdc_inv) begin
        eth_mdc     <=  ~eth_mdc            ;
    end else begin
        eth_mdc     <=   eth_mdc            ;
    end
end
```
#### 上升沿和下降沿的判断
判断逻辑如下：
- 当 `eth_mdc` 为**高电平**并且产生了 `eth_mdc_inv` 的脉冲信号，表示 `eth_mdc` 将会在下一个时钟周期**跳变到低电平**，此时则为 `eth_mdc` 的下降沿
- 当 `eth_mdc` 为**低电平**并且产生了 `eth_mdc_inv` 的脉冲信号，表示 `eth_mdc` 将会在下一个时钟周期**跳变到高电平**，此时则为 `eth_mdc` 的上升沿
```verilog
wire eth_mdc_negedge =  eth_mdc & eth_mdc_inv;   // indicates MDC negedge
wire eth_mdc_posedge = !eth_mdc & eth_mdc_inv;   // indicates MDC posedge
```
#### 完整的 MDIO 驱动代码
已折叠部分代码 (点击即可展开)
```verilog collapse={35-213}
module mdio_dri # (
    parameter   CLK_DIV = 8'd10                 // for MDC generation, The max frequency of MDC is 12.500MHz
)(
    input                   clk             ,   // [ I] [    ] module clock, 100.000MHz is recommended
    input                   rst_n           ,   // [ I] [    ] reset signal, active-low
    input                   eth_start_op    ,   // [ I] [    ] start MDIO configuration pulse

    input   wire            rh_wl           ,   // [ I] [    ] high level for read, and low level for write.
    input   wire    [ 4:0]  phy_addr        ,   // [ I] [ 4:0] 5-bit phy address
    input   wire    [ 4:0]  reg_addr        ,   // [ I] [ 4:0] 5-bit register address 
    input   wire    [15:0]  dat_tx          ,   // [ I] [15:0] 16-bit tx data
    output  reg     [15:0]  dat_rx          ,   // [ O] [15:0] 16-bit rx data

    output  reg             eth_end         ,   // [ O] [    ] pulse signal when transmit done, active-high
    output  reg             eth_module_busy ,   // [ O] [    ] module busy siganl
    output  reg             eth_mdc         ,   // [ O] [    ] serial clock
    inout   wire            eth_mdio            // [IO] [    ] data port 
);
//================================================================================
// Local Parameter Declarations
//================================================================================
// 32-bit preamble  , 2-bit ST      , 2-bit OP  , 
//  5-bit PHYAD     , 5-bit REGAD   , 2-bit TA  ,
// 16-bit DATA      , Then higi-impedance IDLE state.
localparam  DAT_WIDTH       =   7'd64       ;

//================================================================================
// Register Declarations
//================================================================================
reg [7:0]   eth_mdc_cnt     ;
reg         eth_mdc_inv     ;

reg         eth_start_op_d0 ;
reg         eth_start_op_d1 ;

reg [ 7:0]  data_bit_cnt    ;

reg [31:0]  dat_tx_buffer   ;
reg [15:0]  dat_rx_buffer   ;

reg         eth_mdio_out    ; 
//================================================================================
// Wire Declarations
//================================================================================
wire        eth_mdio_in                                                 ;   // mdio data in
wire        eth_mdio_dir                                                ;

wire        eth_start_op_pulse  =  !eth_start_op_d0 & eth_start_op_d1   ;   
wire        eth_mdc_negedge     =   eth_mdc & eth_mdc_inv               ;   // indicates MDC negedge
wire        eth_mdc_posedge     =  !eth_mdc & eth_mdc_inv               ;   // indicates MDC posedge

//================================================================================
// Assign Declarations
//================================================================================
// always output until we transmit/receive 16-bit data stage
assign  eth_mdio_dir    =   (data_bit_cnt <= (8'd48)) ? 1'b0 : rh_wl;

//================================================================================
// implements
//================================================================================
IOBUF # (
    .DRIVE          (   12              ),
    .IBUF_LOW_PWR   (   "TRUE"          ),
    .IOSTANDARD     (   "DEFAULT"       ),
    .SLEW           (   "SLOW"          )
) mdio_obuf (
    .O              (   eth_mdio_in     ),
    .IO             (   eth_mdio        ),
    .I              (   eth_mdio_out    ),
    .T              (   eth_mdio_dir    )   //  1'b1: input, 1'b0: output
);

//================================================================================
// MAIN CODE
//================================================================================
// sync eth_start_op signal
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_start_op_d0 <=  1'b0            ;
        eth_start_op_d1 <=  1'b0            ;
    end else begin
        eth_start_op_d0 <=  eth_start_op    ;
        eth_start_op_d1 <=  eth_start_op_d0 ;
    end
end

// module busy indicator
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_module_busy <=  1'b0            ;
    end else if (eth_start_op_pulse) begin
        eth_module_busy <=  1'b1            ;
    end else if (eth_end) begin
        eth_module_busy <=  1'b0            ;
    end else begin
        eth_module_busy <=  eth_module_busy ;
    end
end

// MDC inv Generation, inv pulse signal is active-high when MDC rising edge and falling edge
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_mdc_cnt <=  32'd0               ;
        eth_mdc_inv <=   1'b0               ;
    end
    else if (eth_mdc_cnt == (CLK_DIV - 1'd1)) begin         // MDC falling edge
        eth_mdc_cnt <=  8'd0                ;
        eth_mdc_inv <=  1'b1                ;
    end
    else if (eth_mdc_cnt == (CLK_DIV[7:1] - 1'd1)) begin    // MDC rising  edge
        eth_mdc_cnt <=  eth_mdc_cnt + 1'd1  ;
        eth_mdc_inv <=   1'b1               ;
    end
    else begin
        eth_mdc_cnt <=  eth_mdc_cnt + 1'd1  ;
        eth_mdc_inv <=  1'b0                ;
    end
end

// generate MDC
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_mdc     <=  1'b0                ;
    end else if (eth_mdc_inv) begin
        eth_mdc     <=  ~eth_mdc            ;
    end else begin
        eth_mdc     <=   eth_mdc            ;
    end
end

// count data bit
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        data_bit_cnt    <=  8'd0            ;
    end else if (
        eth_module_busy     &&
        eth_mdc_negedge     &&
        (data_bit_cnt < DAT_WIDTH)
    ) begin
        data_bit_cnt <=  data_bit_cnt + 1'b1;
    end else if (eth_mdc_negedge && data_bit_cnt == DAT_WIDTH) begin
        data_bit_cnt    <=  8'd0            ;
    end else begin
        data_bit_cnt    <=  data_bit_cnt    ;
    end
end

// send data
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_mdio_out    <=  1'b0            ;
        dat_tx_buffer   <=  32'b0           ;
    end else if (eth_start_op_pulse) begin 
        dat_tx_buffer   <=  {
            2'b01                       ,   // start of frame
            rh_wl                       ,   // Operation code bit 1
            !rh_wl                      ,   // Operation code bit 2
            phy_addr                    ,   // PHY address
            reg_addr                    ,   // Register address
            (rh_wl) ?  2'b00  : 2'b10   ,   // Turnaround
            (rh_wl) ? 16'b0000: dat_tx      // 16-bit data
        };
    end else if (
        eth_module_busy     &&
        eth_mdc_negedge     &&
        (data_bit_cnt < 8'd32)                      
    ) begin
        eth_mdio_out    <=  1'b1                ;   // 32-bit preamble
    end else if (
        eth_module_busy     &&
        eth_mdc_negedge     &&
        (data_bit_cnt < DAT_WIDTH)
    ) begin
        eth_mdio_out    <=  dat_tx_buffer[31]   ;   // MSB First
        dat_tx_buffer   <=  {
            dat_tx_buffer[30:0],
            dat_tx_buffer[  31]
        };
    end else if (
        eth_module_busy     &&
        eth_mdc_negedge     &&
        (data_bit_cnt >= DAT_WIDTH)
    ) begin
        eth_mdio_out    <=  1'b0                ;
        dat_tx_buffer   <=  {32{1'b0}}          ;
    end
end

// receive data
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        dat_rx_buffer       <=  16'b0               ;
    end else if (eth_mdio_dir && eth_mdc_posedge) begin
        dat_rx_buffer[0]    <=  eth_mdio_in         ;
        dat_rx_buffer[15:1] <=  dat_rx_buffer[14:0] ;
    end else begin
        dat_rx_buffer       <=  dat_rx_buffer       ;
    end
end

// move data from dat_rx_buffer to dat_rx output and generate eth_end signal
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        eth_end     <=      1'b0                    ;
        dat_rx      <=      16'b0                   ;
    end else if (eth_mdc_negedge && (data_bit_cnt == DAT_WIDTH)) begin
        eth_end     <=      1'b1                    ;
        dat_rx      <=      dat_rx_buffer           ;
    end else begin
        eth_end     <=      1'b0                    ;
    end
end

endmodule
```