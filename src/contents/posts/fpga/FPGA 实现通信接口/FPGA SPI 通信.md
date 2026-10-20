---
title: FPGA SPI 通信
published: 2026-04-19 14:38:34
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 经验分享
category: FPGA
postID: 52a1f482 # 自动生成, 不要修改这个项目的值
---

### 简介
在之前讲 :post{dir="fpga/FPGA 实现通信接口/FPGA 串口通信.md" text="串口通信"} 的时候，有讲到过**串口通信是异步通信**，而 SPI 通信是一个**典型的同步通信**。它需要**主设备驱动时钟信号线**，所有数据位的发送和接收都在时钟的边沿触发，收发双方不再需要各自校准波特率，也不用起始位/停止位等操作，因此相比于异步的串口通信，这种通信方式效率更高，时序更稳定。缺点则是占用了更多的管脚，在 PCB 的布局布线上相比于串口复杂一些。
### 标准 SPI(四线式) 接口
标准 SPI 接口采用的是四线式接线方式，有 SCLK、MOSI、MISO 以及 SS#/CS# 四根信号线。这种方式的 SPI 接口支持全双工通信，即同时接收和发送。
- **SCK/SCLK**：SPI 的串行时钟，由主设备 (Master) 驱动。
- **MOSI**：全称：Master Out Slave In，是标准 SPI 的一根数据线，由**主机输出**，从机输入
- **MISO**：全称：Master In Slave Out，是标准 SPI 的一根数据线，由**从机输出**，主机输入
- **SS#/CS#**：全称：Slave Select/Chip Select 由**主机驱动的片选信号线**，用于多设备共享一个 SPI 总线时，选定指定设备有效的信号。**该信号低电平有效**。

> 关于片选信号线：从机设备片选信号线为高电平时，不会接收来自 MOSI 数据线上的数据，同时设备本身也不会输出任何数据。

下面是一张多设备共享 SPI 通信的连接方式图
![SPI 一主多从接线方式](/img/posts/fpga_impl_interface/spi/spi_wiring.png)
### 半双工 SPI (三线式) 通信
该种接线方式将数据接口 (MISO、MOSI) 整合成了一个双向数据接口 (SDIO)，不是标准的 SPI 形式，这种 SPI 通信**只支持半双工通信**，但这是一种**常用和被广泛支持的变体**，通常称为 "三线 SPI" 或 "半双工 SPI"。三线式 SPI 通信同样支持多设备共享 SDIO 总线。

用一张表格来对比四线式 SPI 和 三线式 SPI 的区别：

| 对比项  | 标准 SPI (四线式)                     | 三线 SPI (四线式)                |
| ---- | -------------------------------- | --------------------------- |
| 信号线  | **4根**，SCLK, MOSI, **MISO**, CS  | **3根**：SCLK, **SDIO**, CS   |
| 数据线  | **两根独立**：发送 (MOSI) 和接收 (MISO) 分开 | **一根共用**：发送和接收都通过同一条 SDIO 线 |
| 传输模式 | **全双工**：可同时发送和接收                 | **半双工**：同一时刻只能发送或接收，不能同时进行  |
| 引脚数量 | 较多                               | 较少，节省I/O资源                  |

> **关于 SDIO 如何切换数据方向**：这个要看具体的芯片数据手册，每款芯片的数据手册对于换向的时机都是不一样的。如我调试时的某款 ADC 芯片 SDIO 通信时序如下 (**高位先发**)：
>
> ![SPI-SDIO通信时序](/img/posts/fpga_impl_interface/spi/spi_sdio_timing.png)
>
> 
> | bit     | 功能        | 功能介绍                                                          |
> | ------- | --------- | ------------------------------------------------------------- |
> | 23      | R/W#      | 读写控制位，读操作时写 1，写操作时写 0                                         |
> | [22:08] | A0 to A14 | 15 位寄存器地址                                                     |
> | [07:00] | Do to D7  | 7 位数据，读操作时为向寄存器写入该数据，写操作时为读回指定地址的寄存器数据，**读操作时此时的 SDIO 方向为输入** |

### SPI 的四种通信模式
由 **CPOL(时钟极性)** 和 **CPHA(时钟相位)** 控制
- **CPOL(时钟极性)**: 控制 **SCLK** 电平在空闲时的状态
	- 若 **CPOL=0** 则当 SPI 总线**空闲时**, SCLK 处于**低电平**状态
	- 若 **CPOL=1** 则当 SPI 总线**空闲时**, SCLK 处于**高电平**状态
- **CPHA(时钟相位)**: 控制数据的采样边沿
	- 若 **CPHA=0** 则在时钟信号的**第一个跳变沿** (通常是**上升沿**) 进行数据采样
	- 若 **CPHA=1** 则在时钟信号的**第二个跳变沿** (通常是**下降沿**) 进行数据采样

| 模式  | CPOL<br>(时钟极性) | CPHA<br>(时钟相位) |      说明       |
| :-: | :------------: | :------------: | :-----------: |
|  0  |       0        |       0        | 空闲时低电平, 上升沿采集 |
|  1  |       0        |       1        | 空闲时低电平, 下降沿采集 |
|  2  |       1        |       0        | 空闲时高电平, 上升沿采集 |
|  3  |       1        |       1        | 空闲时高电平, 下降沿采集 |

### SPI 模块参数以及端口定义

| 参数              | 功能描述                                                          |
| --------------- | ------------------------------------------------------------- |
| DATA_WIDTH      | 数据位宽                                                          |
| CPOL            | 时钟极性                                                          |
| CPHA            | 时钟相位                                                          |
| DLK_DIV         | SCLK 的时钟分频系数                                                  |
| MOSI_IDLE_STATE | MOSI 信号线在空闲时的状态                                               |
| CONTINUOUS_CLK  | 是否产生连续的时钟信号，若设置为 1'b0，则表示时钟仅在 SPI 活跃时产生。若设置为 1'b1，则表示时钟信号始终产生 |

| 端口            | I/O | 作用                         |
| ------------- | --- | -------------------------- |
| clk           | I   | 模块的时钟输入                    |
| rst_n         | I   | 模块复位信号，低电平有效               |
| dat_tx[N-1:0] | I   | 要通过 SPI 总线发送的数据（N 为数据位宽）   |
| dat_rx[N-1:0] | O   | 由从机接收到的数据（N 为数据位宽）         |
| start_op      | I   | 一个时钟周期的脉冲信号，用于开始 SPI 通信    |
| spi_end       | O   | 一个时钟周期的脉冲信号，表示 SPI 发送或接收完成 |
| spi_sclk      | O   | spi 的时钟信号线                 |
| spi_cs_n      | O   | spi 的片选信号线                 |
| spi_miso      | I   | SPI 的一根数据线，由**从机输出**，主机输入  |
| spi_mosi      | O   | SPI 的一根数据线，由**主机输出**，从机输入  |
| data_bit_cnt  | O   | 发送的比特位计数器，用于在其顶层实现 SDIO 通信 |
```verilog
module spi_master #(
    parameter                       DATA_WIDTH          = 4'd8             , // data width
    parameter                       CPOL                = 1'b0              , // Clock polarity
    parameter                       CPHA                = 1'b0              , // Clock phase
    parameter                       CLK_DIV             = 8'd10             , // input clk division, used to generate SCLK.
    parameter                       MOSI_IDLE_STATE     = 1'b0              , // when module goes to idle. the MOSI line logic level will be set to this value  
    parameter                       CONTINUOUS_CLK      = 1'b0                // when set to 1'b1, the SCLK line will continouous or only toggle when cs is low logic if it sets to 1'b0.
)(
    input                           clk                                     , // module clock
    input                           rst_n                                   , // module reset signal, active low
    
    input       [DATA_WIDTH-1:0]    dat_tx                                  , // the data to be transmitted to slave device
    output  reg [DATA_WIDTH-1:0]    dat_rx                                  , // the data received from the slave device
    input                           start_op                                , // pulse, trigger transfer dat operation

    output  reg                     spi_end                                 , // signal is high when transferring data
    
    // PHY signals      
    output                          spi_sclk                                , // serial clock
    output  reg                     spi_cs_n                                , // chip select signal, active low
    input                           spi_miso                                , // master in slave out
    output  reg                     spi_mosi                                , // master out slave in
    output  reg [7:0           ]    data_bit_cnt                              // bit transmit counter
);
// ...

endmodule
```
### 串行时钟的产生
通过计数器产生 `sclk_inv` 信号，该信号为一个时钟周期的脉冲信号，每一次脉冲信号都代表着 SCLK 信号将会在下一个时钟周期跳变一次。
```verilog
// REGION_HEADER------------------------------------------------------------------------------------
reg                         spi_sclk_inv                ; // This signal is a pulse signal with a clk period, and on its rising edge, the SCLK signal will invert once.
reg                         spi_sclk_internal           ; // internal serial clock divied from module clock

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
```
### 时钟边沿的判断
根据内部的 `sclk_internal` 信号，即可判断上升沿和下降沿。
- 当 `sclk_internal` 是**高电平**且 `spi_sclk_inv` 产生了脉冲信号的时候，表示 `sclk_internal` 将会**在下个时钟周期跳变到低电平**，此时则为 `sclk_internal` 的下降沿。
- 当 `sclk_internal` 是**低电平**且 `spi_sclk_inv` 产生了脉冲信号的时候，表示 `sclk_internal` 将会**在下个时钟周期跳变到高电平**，此时则为 `sclk_internal` 的上升沿。
- `update_edge` 和 `sample_edge` 则表示 SPI 数据的更新边沿和采样边沿，依照 CPHA 参数的设置在上升沿或下降沿更新/采样数据。

```verilog startLineNumber=58
wire    spi_sclk_negedge    =   spi_sclk_internal & spi_sclk_inv                ; // pulse signal, indicates SCLK negedge
wire    spi_sclk_posedge    =  !spi_sclk_internal & spi_sclk_inv                ;
wire    update_edge         = (CPHA == 0) ? spi_sclk_negedge : spi_sclk_posedge ; // Select update and sample edges based on CPHA
wire    sample_edge         = (CPHA == 0) ? spi_sclk_posedge : spi_sclk_negedge ;
```

### 完整的 SPI 代码
代码较长，已对 `50-238` 行的代码内容进行折叠操作

```verilog collapse={50-237}
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
reg                         spi_busy                    ; // internal busy signal
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
```
### 实现三线式 SPI 通信
SDIO 通信完全不需要从头开始编写代码，以上方提供的 `spi_master` 模块的代码作为基础，将其作为一个子模块封装到顶层模块，再用 IOBUF 原语实现一个双向 IO 即可。

完整代码如下：
```verilog
module sdio_interface (
    input   wire            clk             ,   //  模块的时钟信号
    input   wire            rst_n           ,   //  模块的复位信号，低电平有效
    
    input   wire            rh_wl           ,   //  读写控制信号, 读为高电平，写为低电平
    input   wire            sdio_start_op   ,   //  操作使能的脉冲信号
    input   wire    [15:00] register_addr   ,   //  16 位寄存器地址
    input   wire    [07:00] dat_tx          ,   //  要发送的数据
    output  wire    [07:00] dat_rx          ,   //  从 sdio 接口读取到的 8 位寄存器数据
    
    output  wire            spi_sclk        ,   //  串行时钟信号
    output  wire            spi_cs_n        ,   //  片选信号
    inout   wire            sdio            ,   //  双向 IO 端口
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
) ms14d2600_spi_iobuf (
    .O              (   spi_miso        ),  //  IOBUF 原语的输出端口，接到 spi_miso 中
    .IO             (   sdio            ),  //  IOBUF 原语的双向端口，输出到模块端口
    .I              (   spi_mosi        ),  //  IOBUF 原语的输入端口，接到 spi_mosi 中
    .T              (   sdio_dir        )   //  IOBUF 原语的方向控制端口，low: output, high: input
);

endmodule
```
这里我实现的三线式 SPI 通信适用于我上面提到的某款 ADC 芯片通信时序，对于 sdio 方向的更改时机可以通过修改代码中第 21 行：
```verilog
wire    sdio_dir = (data_bit_cnt <= 16) ? 1'b0 : rh_wl; // 前 16 位：读写控制位和寄存器地址，固定为输出方向，低 8 位根据读写控制来调整方向
```
将判断条件设置为你需要的值即可。