---
title: FPGA 串口通信
published: 2026-04-17 14:08:17
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 经验分享
category: FPGA
postID: 96d23a91 # 自动生成, 不要修改这个项目的值
---

## 简介
串口，即 UART(全称 Universal Asynchronous Receiver/Transmitter，中文正式名称为通用异步收发器)，是采用串行通信方式的接口。串行通信将字节数据**按比特在一条数据线上逐个传输**，其特点是线路简单，但传输速度较慢。

对于传输速度要求不高的场合，如工业控制、嵌入式开发等领域，串口通信是常客。
## 串口通信方式
UART 通信需要两根信号线来实现，分别是 TXD 和 RXD。TXD 用来发送数据；RXD 用来接收数据。在发送数据时，将并行的 8 比特数据按比特在一条数据线上逐个传输。在接收数据时，将接收到的串行数据按比特解串成并行数据。**发送时低位先发。**

需要注意的是，两个串口设备通信时，不能把各自的 TXD 和 RXD 直接对应相连（即 TXD 接 TXD、RXD 接 RXD），而应该交叉连接：一个设备的 TXD 接另一个设备的 RXD，同时这个设备的 RXD 接另一个设备的 TXD。具体连接方式如下图所示。
![串口接线方式](/img/posts/fpga_impl_interface/uart/wiring.png)

## 串口通信数据格式
如下图所示，下图为**一个字节数据 (字符帧)** 的传输格式
![异步串口通信数据格式图](/img/posts/fpga_impl_interface/uart/data_format.png)
- **起始位**：标志着一帧数据的开始，该位**固定为 0**
- **数据位**：一帧数据中的**有效数据**，在串口设置中可配置为 5、6、7、8 位
- **校验位**：分为**奇校验**和**偶校验**。为了使得整体 1 的个数为对应的奇数/偶数，在该位补齐对应的 0 或 1，例图如下：
	- ![串口校验位-奇校验图例](/img/posts/fpga_impl_interface/uart/parity_odd.png)
	- ![串口校验位-偶校验图例](/img/posts/fpga_impl_interface/uart/parity_even.png)
	- 总结一下就是：奇偶校验是为了让传输的数据（包含校验位）中 1 的个数为奇数/偶数。如果传输字节中 1 的个数为 偶数/奇数，则校验位的数据为 1，否则为 0。
- **停止位**：标志着一个数据帧的结束。该位**固定为 1**
## 波特率
串口通信中，我们用波特率表示数据传输的快慢。波特率表示每秒传输了多少个二进制位（bit）。通信双方各自使用本地时钟源，通过分频得到所需的波特率时钟信号。这种不需要额外传输时钟信号的方式，就是异步通信——其本质是双方各自依赖本地时钟，依靠起始位来完成字符同步。

常见的波特率有 9600、19200 以及 115200 等。波特率是人为规定的，理论上你可以设置任何速度的波特率，只要通信双方波特率一致，就可以正常通信。但实际硬件和软件通常只支持有限个常用值，这受限于系统时钟的分频：分频只能得到某些特定的数值，例如前面提到的常见波特率。此外，常见的操作系统和串口软件通常也只在常用波特率列表中提供选择，支持手动输入任意波特率的情况并不多。
## 实现代码
#### 串口发送模块
该模块负责串口数据的发送，已折叠部分代码 (点击折叠内容即可打开)
```verilog collapse={30-164}
// FILE_HEADER_HEADER-------------------------------------------------------------------------------
// Copyright (c) 2026, Mr. Tian. All rights reserved.
//--------------------------------------------------------------------------------------------------
// FILE NAME        : uart_tx.v
// AUTHOR           : Mr. Tian
// DESCRIPTION      : UART transmitter
//--------------------------------------------------------------------------------------------------
// REVISION HISTORY :
//  Rev: (2026-05-06) - Mr. Tian
//          Initial release.
// FILE_HEADER_FOOTER-------------------------------------------------------------------------------

module uart_tx # (
    parameter   CLOCK_FREQ  =   32'd100_000_000 ,   //  输入时钟频率 (200MHz)
    parameter   BAUD_RATE   =   32'd115200      ,   //  波特率
    parameter   DATA_BITS   =   8               ,   //  数据位
    parameter   PARITY      =   "ODD"           ,   //  校验方式，有 ODD(奇校验)、EVEN(偶校验)、SPACE(始终为 0)、MARK(始终为 1)、NONE(无校验)
    parameter   STOP_BITS   =   "1"                 //  停止位: 1, 1.5, 2，输入其它值则默认为 1 停止位
) (
    input                   clk     ,   //  [I][     ] 输入的模块时钟，推荐 100.000 MHz
    input                   rst_n   ,   //  [I][     ] 模块复位信号，低电平有效

    input   wire            tx_en   ,   //  [I][     ] 发送使能信号，高脉冲有效
    input   wire    [07:00] tx_data ,   //  [I][07:00] 要发送的数据
    
    output  reg             tx_busy ,   //  [O][     ] 发送机忙信号
    output  reg             txd         //  [O][     ] TXD 信号线
);
    
localparam  BAUD_CNT_MAX        =   CLOCK_FREQ / BAUD_RATE  ;   //  计数器的最大计数值
localparam  BAUD_CNT_MID        =   BAUD_CNT_MAX / 2        ;   //  计数器值的中点
localparam  HAS_PARITY          =   (PARITY != "NONE")      ;   //  是否使用了校验位
localparam  STOP_BIT_INDEX      =   DATA_BITS + (HAS_PARITY ? 1 : 0) + 1 ;  // 停止位在 bit_cnt 中的位置

// 根据停止位长度计算停止位结束时刻的 baud_cnt 计数值
// 1   -> 在停止位中点（BAUD_CNT_MAX/2 - 1）结束
// 1.5 -> 在停止位中点后继续 1 个位周期（BAUD_CNT_MAX + BAUD_CNT_MAX/2 - 1）
// 2   -> 在停止位中点后继续 1.5 个位周期（2*BAUD_CNT_MAX - 1）
// 为了保持代码一致，减 1 的操作在 always 语句中进行
localparam  STOP_BITS1_CNT      =   BAUD_CNT_MAX/2                  ;   //  停止位为 1   时计数器的值
localparam  STOP_BITS1_5_CNT    =   BAUD_CNT_MAX + BAUD_CNT_MAX/2   ;   //  停止位为 1.5 时计数器的值
localparam  STOP_BITS2_CNT      =   (2 * BAUD_CNT_MAX)              ;   //  停止位为 2   时计数器的值

localparam  STOP_END_CNT        =   (STOP_BITS == "1"  ) ? (STOP_BITS1_CNT  ) :
                                    (STOP_BITS == "1.5") ? (STOP_BITS1_5_CNT) :
                                    (STOP_BITS == "2"  ) ? (STOP_BITS2_CNT  ) :
                                     STOP_BITS1_CNT                             ;   // 停止位计数器的值，默认按停止位 1 处理

reg [31:00] baud_cnt    ;
reg [03:00] bit_cnt     ;
reg [07:00] data_reg    ;

wire        parity_bit  ;

// 校验位计算，使用的是缩位异或运算
// 缩位异或运算用来检查数据中 1 的个数是否为奇数，对其计算结果取反后可用于检查数据中 1 的个数是否为偶数
assign      parity_bit  =  (PARITY == "ODD"  ) ? ~(^tx_data[DATA_BITS-1:0]) :
                           (PARITY == "EVEN" ) ?   ^tx_data[DATA_BITS-1:0]  :
                           (PARITY == "MARK" ) ? 1'b1 :
                           (PARITY == "SPACE") ? 1'b0 :
                           (PARITY == "NONE" ) ? 1'b0 :
                           1'bz;

// 判断校验位的参数是否正确
initial begin
    if (
        !((PARITY == "ODD"  ) ||
          (PARITY == "EVEN" ) ||
          (PARITY == "MARK" ) ||
          (PARITY == "SPACE") ||
          (PARITY == "NONE" ))
    ) begin
        $error("Unknown PARITY value: [%s], for parameter PARITY, its value must be one of these values: ODD,EVEN,MARK,SPACE or NONE.", PARITY);
    end
end

// 打拍同步 tx_en 信号，检测上升沿
reg [2:0] tx_en_sr;
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) tx_en_sr <= 3'b111;
    else        tx_en_sr <= {tx_en_sr[1:0], tx_en};
end
wire tx_en_rising_edge = (tx_en_sr[2:1] == 2'b01); // 上升降沿检测

//  当 tx_en 检测到上升沿时, 寄存输入的并行数据, 并拉高 busy 信号
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        data_reg    <=  8'b0        ;
        tx_busy     <=  1'b0        ;
    end else if (tx_en_rising_edge) begin
        data_reg    <=  tx_data     ;   //  检测到上升沿, 寄存输入的并行数据
        tx_busy     <=  1'b1        ;   //  拉高 busy 信号
    end else if (bit_cnt == STOP_BIT_INDEX && baud_cnt == STOP_END_CNT - 1'b1) begin
        data_reg    <=  8'b0        ;   //  计数到停止位时清空发送数据寄存器
        tx_busy     <=  1'b0        ;   //  拉低 busy 信号
    end else begin
        data_reg    <=  data_reg    ;
        tx_busy     <=  tx_busy     ;
    end
end

//  波特率计数器
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        baud_cnt    <=  16'd0           ;
    end else if (tx_busy) begin 
        if(bit_cnt == STOP_BIT_INDEX) begin             //  停止位阶段
            if(baud_cnt < STOP_END_CNT)         
                baud_cnt <= baud_cnt + 1'b1     ;       //  计数器计数到结束时刻
            else
                baud_cnt <= 16'd0               ;       // 到达停止位结束时刻，清零（随后rx_flag变低）
        end else begin
            if (baud_cnt < BAUD_CNT_MAX - 1'b1) begin   //  正常阶段，非停止位正常循环计数
                baud_cnt    <=  baud_cnt + 1'b1 ;       //  接收过程时计数器循环计数
            end else begin
                baud_cnt <= 16'd0               ;       // 完成了一个计数周期后清零
            end
        end
    end else begin
        baud_cnt    <=  16'd0                   ;       //  空闲状态清零
    end
end

//  接收数据计数器
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        bit_cnt         <=  4'd0            ;
    end else if (tx_en_rising_edge) begin 
        bit_cnt         <=  4'd0            ;
    end else if (tx_busy) begin 
        if (bit_cnt < STOP_BIT_INDEX) begin
            if(baud_cnt == BAUD_CNT_MAX - 1'b1) begin  // 每个位周期结束时自增
                bit_cnt <=  bit_cnt + 1'b1  ;
            end else begin
                bit_cnt <=  bit_cnt         ;
            end
        end else begin      // 已到达停止位索引，保持不变，等待 rx_flag 拉低
            bit_cnt     <=  bit_cnt         ;
        end
    end else begin
        bit_cnt <= 4'd0 ;   //  空闲状态清零
    end
end

//  根据 bit_cnt 来发送数据到 txd 端口
always @(posedge clk or negedge rst_n) begin
    if(!rst_n) 
        txd <=  1'b1    ;
    else if(tx_busy) begin                          // 系统发送忙状态时
        if(baud_cnt == BAUD_CNT_MID - 1'b1) begin   // 判断 baud_cnt 是否计数到数据位的中间
            if (bit_cnt == 0) begin
                txd <=  1'b0                ;   //  起始位
            end else if((bit_cnt >= 1) && (bit_cnt <= DATA_BITS)) begin
                txd <=  data_reg[bit_cnt-1] ;   //  由低到高位发送数据
            end else if (HAS_PARITY == 1'b1 && bit_cnt == STOP_BIT_INDEX - 1) begin
                txd <=  parity_bit          ;   //  发送校验位
            end
        end else begin
            txd <=  txd ;
        end
    end else begin
        txd <=  1'b1    ;   // 空闲时清零（不保留残余）
    end
end

endmodule
```
#### 串口接收模块
该模块负责串口数据的接收，已折叠部分代码 (点击折叠内容即可打开)
```verilog collapse={30-185}
// FILE_HEADER_HEADER-------------------------------------------------------------------------------
// Copyright (c) 2026, Mr. Tian. All rights reserved.
//--------------------------------------------------------------------------------------------------
// FILE NAME        : uart_rx.v
// AUTHOR           : Mr. Tian
// DESCRIPTION      : UART receiver
//--------------------------------------------------------------------------------------------------
// REVISION HISTORY :
//  Rev: (2026-05-06) - Mr. Tian
//          Initial release.
// FILE_HEADER_FOOTER-------------------------------------------------------------------------------
module uart_rx # (
    parameter   CLOCK_FREQ  =   32'd100_000_000 ,   //  输入时钟频率 (200MHz)
    parameter   BAUD_RATE   =   32'd115200      ,   //  波特率
    parameter   DATA_BITS   =   8               ,   //  数据位
    parameter   PARITY      =   "ODD"           ,   //  校验方式，有 ODD(奇校验)、EVEN(偶校验)、SPACE(始终为 0)、MARK(始终为 1)、NONE(无校验)
    parameter   STOP_BITS   =   "1"                 //  停止位: 1, 1.5, 2，输入其它值则默认为 1 停止位
) (
    input                   clk     ,   //  [I][     ] 模块时钟
    input                   rst_n   ,   //  [I][     ] 复位信号，低有效

    input   wire            rxd     ,   //  [I][     ] RXD 信号线
    
    output  reg     [07:00] rx_data ,   //  [O][07:00] 接收到的数据
    output  reg             rx_done ,   //  [O][     ] 接收完成标志（高脉冲）
    output  reg             rx_err      //  [O][     ] 错误标志（校验错误或帧错误）
);

localparam  BAUD_CNT_MAX        =   CLOCK_FREQ / BAUD_RATE  ;   //  计数器的最大计数值
localparam  BAUD_CNT_MID        =   BAUD_CNT_MAX / 2        ;   //  计数器值的中点
localparam  HAS_PARITY          =   (PARITY != "NONE")      ;   //  是否使用了校验位
localparam  STOP_BIT_INDEX      =   DATA_BITS + (HAS_PARITY ? 1 : 0) + 1 ;  // 停止位在 bit_cnt 中的位置

// 根据停止位长度计算停止位结束时刻的 baud_cnt 计数值
// 1   -> 在停止位中点（BAUD_CNT_MAX/2 - 1）结束
// 1.5 -> 在停止位中点后继续 1 个位周期（BAUD_CNT_MAX + BAUD_CNT_MAX/2 - 1）
// 2   -> 在停止位中点后继续 1.5 个位周期（2*BAUD_CNT_MAX - 1）
// 为了保持代码一致，减 1 的操作在 always 语句中进行
localparam  STOP_BITS1_CNT      =   BAUD_CNT_MAX/2                  ;   //  停止位为 1   时计数器的值
localparam  STOP_BITS1_5_CNT    =   BAUD_CNT_MAX + BAUD_CNT_MAX/2   ;   //  停止位为 1.5 时计数器的值
localparam  STOP_BITS2_CNT      =   (2 * BAUD_CNT_MAX)              ;   //  停止位为 2   时计数器的值

localparam  STOP_END_CNT        =   (STOP_BITS == "1"  ) ? (STOP_BITS1_CNT  ) :
                                    (STOP_BITS == "1.5") ? (STOP_BITS1_5_CNT) :
                                    (STOP_BITS == "2"  ) ? (STOP_BITS2_CNT  ) :
                                     STOP_BITS1_CNT                             ;   // 停止位计数器的值，默认按停止位 1 处理

reg [31:00] baud_cnt    ;
reg [03:00] bit_cnt     ;
reg [07:00] rx_reg      ;
reg         rx_parity   ;   //  接收到的校验位

// 打拍同步 rxd 信号，检测下降沿
reg [2:0] rxd_sync;
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) rxd_sync <= 3'b111;
    else        rxd_sync <= {rxd_sync[1:0], rxd};
end
wire rxd_fall = (rxd_sync[2:1] == 2'b10); // 下降沿检测
wire rxd_s    = rxd_sync[2];              // 同步后的电平

// 校验计算逻辑
wire    parity_check;
assign  parity_check    =  (PARITY == "ODD"  ) ? ~(^rx_reg[DATA_BITS-1:0]) :
                           (PARITY == "EVEN" ) ?   ^rx_reg[DATA_BITS-1:0]  :
                           (PARITY == "MARK" ) ? 1'b1 :
                           (PARITY == "SPACE") ? 1'b0 :
                           (PARITY == "NONE" ) ? 1'b0 :
                           1'bz;
initial begin
    if (
        !((PARITY == "ODD"  ) ||
          (PARITY == "EVEN" ) ||
          (PARITY == "MARK" ) ||
          (PARITY == "SPACE") ||
          (PARITY == "NONE" ))
    ) begin
        $error("Unknown PARITY value: [%s], for parameter PARITY, its value must be one of these values: ODD,EVEN,MARK,SPACE or NONE.", PARITY);
    end
end

// 接收标志指示器
reg     rx_flag;
wire    start_en = rxd_fall & ~rx_flag;
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        rx_flag <=  1'b0    ;
    end else if (start_en) begin    //  检测到起始位
        rx_flag <=  1'b1    ;       //  接收过程中，标志信号 rx_flag 拉高
        // 根据停止位长度，在指定时刻结束接收
    end else if (bit_cnt == STOP_BIT_INDEX && baud_cnt == STOP_END_CNT - 1'b1) begin
        rx_flag <=  1'b0    ;
    end else begin
        rx_flag <= rx_flag  ;
    end
end

//  波特率计数器
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        baud_cnt    <=  16'd0           ;
    end else if (rx_flag) begin 
        if(bit_cnt == STOP_BIT_INDEX) begin             //  停止位阶段
            if(baud_cnt < STOP_END_CNT)         
                baud_cnt <= baud_cnt + 1'b1     ;       //  计数器计数到结束时刻
            else
                baud_cnt <= 16'd0               ;       // 到达停止位结束时刻，清零（随后rx_flag变低）
        end else begin
            if (baud_cnt < BAUD_CNT_MAX - 1'b1) begin   //  正常阶段，非停止位正常循环计数
                baud_cnt    <=  baud_cnt + 1'b1 ;       //  接收过程时计数器循环计数
            end else begin
                baud_cnt <= 16'd0               ;       // 完成了一个计数周期后清零
            end
        end
    end else begin
        baud_cnt    <=  16'd0                   ;       //  空闲状态清零
    end
end

//  接收数据计数器
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        bit_cnt         <=  4'd0            ;
    end else if (rx_flag) begin 
        if (bit_cnt < STOP_BIT_INDEX) begin
            if(baud_cnt == BAUD_CNT_MAX - 1'b1) begin  // 每个位周期结束时自增
                bit_cnt <=  bit_cnt + 1'b1  ;
            end else begin
                bit_cnt <=  bit_cnt         ;
            end
        end else begin      // 已到达停止位索引，保持不变，等待 rx_flag 拉低
            bit_cnt     <=  bit_cnt         ;
        end
    end else begin
        bit_cnt <= 4'd0 ;   //  空闲状态清零
    end
end

//  根据 bit_cnt 来寄存 rxd 端口数据
always @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin
        rx_reg      <= 8'b0                     ;
        rx_parity   <=  1'b0                    ;
    end else if(rx_flag) begin                          // 系统处于接收过程时
        if(baud_cnt == BAUD_CNT_MID - 1'b1) begin   // 判断 baud_cnt 是否计数到数据位的中间
            if((bit_cnt >= 1) && (bit_cnt <= DATA_BITS)) begin
                rx_reg[bit_cnt-1]   <= rxd_s    ;   //  数据位采样 (按位索引写入)
            end else if (HAS_PARITY == 1'b1 && bit_cnt == STOP_BIT_INDEX - 1'b1) begin
                rx_parity           <=  rxd_s   ;   //  采样校验位
            end
        end else begin
            rx_reg <= rx_reg;
        end
    end else begin
        rx_reg <= 8'b0;   // 空闲时清零（不保留残余）
    end
end

//  校验位判断, 若校验位不通过则将 rx_err 置 1
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        rx_err  <=  1'b0    ;
    end else if ((HAS_PARITY == 1'b1) && (rx_parity == parity_check)) begin
        rx_err  <=  1'b0    ;
    end else begin
        rx_err  <=  1'b1    ;
    end
end

//  赋值接收完成信号和接收到的数据
always @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin
        rx_done <= 1'b0;
        rx_data <= 8'b0;
    end
    // 在停止位中点采样完毕时输出数据
    else if((bit_cnt == STOP_BIT_INDEX) && (baud_cnt == BAUD_CNT_MID - 1'b1)) begin
        rx_done <= 1'b1     ;  // 拉高接收完成信号
        rx_data <= rx_reg   ;  // 并对UART接收到的数据进行赋值
    end    
    else begin
        rx_done <= 1'b0     ;
        rx_data <= rx_data  ;
    end
end

endmodule
```

#### 封装后的串口顶层
为了方便使用，直接将发送模块和接收模块作为两个子模块封装到一个顶层模块中。
```verilog
// FILE_HEADER_HEADER-------------------------------------------------------------------------------
// Copyright (c) 2026, Mr. Tian. All rights reserved.
//--------------------------------------------------------------------------------------------------
// FILE NAME        : uart.v
// AUTHOR           : Mr. Tian
// DESCRIPTION      : Top level UART module encapsulating TX and RX
//--------------------------------------------------------------------------------------------------
// REVISION HISTORY :
//  Rev: (2026-05-06) - Mr. Tian
//          Initial release.
// FILE_HEADER_FOOTER-------------------------------------------------------------------------------
module uart # (
    parameter               CLOCK_FREQ  =   32'd100_000_000 ,   //  输入时钟频率 (200MHz)
    parameter               BAUD_RATE   =   32'd115200      ,   //  波特率
    parameter               DATA_BITS   =   8               ,   //  数据位
    parameter   [8*8-1:0]   PARITY      =   "ODD"           ,   //  校验方式，有 ODD(奇校验)、EVEN(偶校验)、SPACE(始终为 0)、MARK(始终为 1)、NONE(无校验)
    parameter   [8*8-1:0]   STOP_BITS   =   "1"                 //  停止位: 1, 1.5, 2，输入其它值则默认为 1 停止位
) (
    input                   clk     ,
    input                   rst_n   ,

    // TX 接口
    input   wire            tx_en   ,
    input   wire    [07:00] tx_data ,
    output  wire            tx_busy ,
    output  wire            txd     ,

    // RX 接口
    input   wire            rxd     ,
    output  wire    [07:00] rx_data ,
    output  wire            rx_done ,
    output  wire            rx_err
);

// 实例化发送模块
uart_tx #(
    .CLOCK_FREQ (CLOCK_FREQ ),
    .BAUD_RATE  (BAUD_RATE  ),
    .DATA_BITS  (DATA_BITS  ),
    .PARITY     (PARITY     ),
    .STOP_BITS  (STOP_BITS  )
) uart_tx_inst (
    .clk        (clk        ),
    .rst_n      (rst_n      ),
    .tx_en      (tx_en      ),
    .tx_data    (tx_data    ),
    .tx_busy    (tx_busy    ),
    .txd        (txd        )
);

// 实例化接收模块
uart_rx #(
    .CLOCK_FREQ (CLOCK_FREQ ),
    .BAUD_RATE  (BAUD_RATE  ),
    .DATA_BITS  (DATA_BITS  ),
    .PARITY     (PARITY     ),
    .STOP_BITS  (STOP_BITS  )
) uart_rx_inst (
    .clk        (clk        ),
    .rst_n      (rst_n      ),
    .rxd        (rxd        ),
    .rx_data    (rx_data    ),
    .rx_done    (rx_done    ),
    .rx_err     (rx_err     )
);

endmodule
```
#### 回环测试(工程顶层)代码
在这里我使用的开发板型号为 `XC7K325TFFG900-2`，时钟输入为差分信号输入
```verilog
// FILE_HEADER_HEADER-------------------------------------------------------------------------------
// Copyright (c) 2026, Mr. Tian. All rights reserved.
//--------------------------------------------------------------------------------------------------
// FILE NAME        : uart_loopback_top.v
// AUTHOR           : Mr. Tian.
// DESCRIPTION      : Top module for uart loopback
//--------------------------------------------------------------------------------------------------
// REVISION HISTORY :
//  Rev: (2026-05-06) - Mr. Tian.
//          Initial release.
// FILE_HEADER_FOOTER-------------------------------------------------------------------------------
module uart_loopback_top # (
    parameter   CLOCK_FREQ  =   32'd200_000_000 ,   //  输入时钟频率 (200MHz)
    parameter   BAUD_RATE   =   32'd115200      ,   //  波特率
    parameter   DATA_BITS   =   8               ,   //  数据位
    parameter   PARITY      =   "NONE"           ,   //  校验方式，有 ODD(奇校验)、EVEN(偶校验)、SPACE(始终为 0)、MARK(始终为 1)、NONE(无校验)
    parameter   STOP_BITS   =   "1"                 //  停止位: 1, 1.5, 2，输入其它值则默认为 1 停止位
) (
    input                   sys_clk_p,              // 200MHz 差分时钟 P 端
    input                   sys_clk_n,              // 200MHz 差分时钟 N 端
    input                   rst_n   ,               // 复位信号（低有效）

    // 硬件引脚连接到串口芯片
    input                   uart_rxd,               // UART 接收引脚
    output                  uart_txd,               // UART 发送引脚
    
    // 连接到 LED 的状态指示
    output                  led_rx_done,
    output                  led_err
);

// 差分时钟输入转单端时钟输出
wire clk_200m_single;
IBUFDS ibufds_inst (
    .I  (   sys_clk_p       ),
    .IB (   sys_clk_n       ),
    .O  (   clk_200m_single )
);

// 例化串口模块
wire            tx_en   ;
wire    [07:00] tx_data ;
wire    [07:00] rx_data ;
wire            tx_busy ;
wire            rx_done ;
uart # (
    .CLOCK_FREQ (CLOCK_FREQ ),
    .BAUD_RATE  (BAUD_RATE  ),
    .DATA_BITS  (DATA_BITS  ),
    .PARITY     (PARITY     ),
    .STOP_BITS  (STOP_BITS  )
) uart_inst (
    .clk        (   clk_200m_single ),
    .rst_n      (   rst_n           ),

    // TX interface
    .tx_en      (   tx_en           ),
    .tx_data    (   tx_data         ),
    .tx_busy    (   tx_busy         ),
    .txd        (   uart_txd        ),

    // RX interface
    .rxd        (   uart_rxd        ),
    .rx_data    (   rx_data         ),
    .rx_done    (   rx_done         ),
    .rx_err     (   led_err         )
);

assign tx_data      = rx_data; // 回环测试：发送的数据为接收到的数据
assign tx_en        = rx_done; // 回环测试：发送使能信号为接收完成信号
assign led_rx_done  = rx_done; // 将接收完成信号输出到板载的一颗 led 上

endmodule
```



