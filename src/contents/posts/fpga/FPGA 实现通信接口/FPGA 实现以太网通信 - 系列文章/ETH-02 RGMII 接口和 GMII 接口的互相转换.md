---
title: ETH-02 RGMII 接口和 GMII 接口的互相转换
description: RGMII 采用双边沿传输数据, FPGA 只采上升沿会丢数据。本文说明如何用 Xilinx IDDR 与 ODDR 原语完成 RGMII 与 GMII 之间的互相转换。
published: 2026-04-14 14:26:09
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 通信接口
  - 以太网
  - 经验分享
category: FPGA
postID: db8d0357 # 自动生成, 不要修改这个项目的值
---

在 ${post 4a0bb95d} 中我讲到了 RGMII 接口和 GMII 的两种数据接口。本篇则围绕这两种数据接口的互相转换展开。
## 前言
**在 FPGA 中，数据通常只在时钟的上升沿被采集。对于采用双边沿数据有效的 RGMII 接口而言，若仅使用上升沿进行采样，就会丢失下降沿所对应的数据**。同理，FPGA 在输出数据时，也只能在上升沿发生变化。为解决这一问题，Xilinx 提供了 `IDDR` 和 `ODDR` 两个原语，分别用于接收和发送双边沿数据。

${note [info]
下方所有配图均来自 [[7Series FPGAs SelectIO Resources User Guide (UG471)]](https://docs.amd.com/v/u/en-US/ug471_7Series_SelectIO), 你可以打开 DOCNav 来搜索对应的文档名称
}

## IDDR (Input Double Data Rate)
`IDDR` 的作用是将 RGMII 接口中的**双边沿数据** (DDR) 转换为 FPGA 内部可以处理的**单边沿数据**，`IDDR` 将双边沿变化的数据通过寄存器输出到了 Q1/Q2 两个端口上，分别代表上升沿的数据和下降沿的数据。

下面是 IDDR 原语的语言模板
```verilog
IDDR #(
  .DDR_CLK_EDGE (   "OPPOSITE_EDGE" ), // 数据对齐参数，有 "OPPOSITE_EDGE", "SAME_EDGE" or "SAME_EDGE_PIPELINED" 
  .INIT_Q1      (   1'b0            ), // Q1 的初始值: 1'b0 or 1'b1
  .INIT_Q2      (   1'b0            ), // Q2 的初始值: 1'b0 or 1'b1
  .SRTYPE       (   "SYNC"          ) // Set/Reset type: "SYNC" or "ASYNC" 
) IDDR_inst (
  .Q1   (   Q1  ),  // 1-bit 时钟上升沿输出的值
  .Q2   (   Q2  ),  // 1-bit 时钟下降沿输出的值
  .C    (   C   ),  // 1-bit 时钟输入
  .CE   (   CE  ),  // 1-bit 时钟使能信号
  .D    (   D   ),  // 1-bit DDR 信号输入
  .R    (   R   ),  // 1-bit 复位信号
  .S    (   S   )   // 1-bit 置位信号，优先级低于复位信号
);
```
### 参数介绍
- **DDR_CLK_EDGE**：数据对齐方式，该参数将在下文介绍。
- **INIT_Q1/Q2**：初始化 Q1、Q2 的初始值。
- **SRTYPE**：配置复位/置位信号为同步/异步。建议是使用同步复位驱动 R/S，以避免亚稳态的产生。
### 端口介绍
- **Q1/Q2**：数据的输出端口，Q1 输出时钟上升沿的数据，Q2 输出时钟下降沿的数据。
- **C**：时钟的输入端口。
- **CE**：时钟的使能信号，高电平有效。
- **D**：DDR 信号的输入端口。
- **R/S**：复位/置位信号，只能使用其中之一 (置1)，或全部不使用 (置 0)。复位信号使得 Q1/Q2 输出 0，置位信号使得 Q1/Q2 输出 1。
### IDDR 数据对齐方式
- **OPPOSITE_EDGE**：数据对齐的基本模式，该模式实现了基本的 DDR 功能，**但是输出的数据 Q1/Q2 在单个时钟周期内不能同时有效**，对逻辑设计不友好，已经较少使用。下图为该模式下的时序图例。
- ![IDDR_CLK_EDGE_OPPOSITE_EDGE](../../../../../assets/img/posts/fpga_impl_interface/ethernet_impl/eth-02/IDDR_CLK_EDGE_OPPOSITE_EDGE.png)
- **SAME_EDGE**：数据在同一个时钟沿提供给内部逻辑，能有效避免时序冲突。缺点是**两个数据之间有一个时钟周期的延迟差异**，在逻辑上需要处理 "错位"。下图为该模式下的时序图例。
- ![IDDR_CLK_EDGE_SAME_EDGE](../../../../../assets/img/posts/fpga_impl_interface/ethernet_impl/eth-02/IDDR_CLK_EDGE_SAME_EDGE.png)
- **SAME_EDGE_PIPELINED**：完美的数据对齐，两个输出 Q1/Q2 在**相同的钟沿同时有效**。代价则是引入了额外的延时，通常是 2 个时钟周期。下图为该模式下的时序图例。
- ![IDDR_CLK_EDGE_SAME_EDGE_PIPELINED](../../../../../assets/img/posts/fpga_impl_interface/ethernet_impl/eth-02/IDDR_CLK_EDGE_SAME_EDGE_PIPELINED.png)
通过时序图我们可以看到 `IDDR` 原语在 `SAME_EDGE_PIPELINED` 对齐模式下满足了我们的数据对齐要求，所以在这里我们使用 `SAME_EDGE_PIPELINED` 对齐方式。
## ODDR (Output Double Data Rate)
`ODDR` 的作用正好与 `IDDR` 是相反的，它通过在**时钟的上升沿更新 `Q1/Q2` 的值**，之后输出双边沿变化的 DDR 信号。

下面是 ODDR 的语言模板
```verilog
ODDR #(
  .DDR_CLK_EDGE ("OPPOSITE_EDGE"),  // "OPPOSITE_EDGE" or "SAME_EDGE" 
  .INIT         (1'b0           ),  // Initial value of Q: 1'b0 or 1'b1
  .SRTYPE       ("SYNC"         )   // Set/Reset type: "SYNC" or "ASYNC" 
) ODDR_inst (
  .Q            (   Q           ),  // 1-bit DDR output
  .C            (   C           ),  // 1-bit clock input
  .CE           (   CE          ),  // 1-bit clock enable input
  .D1           (   D1          ),  // 1-bit data input (positive edge)
  .D2           (   D2          ),  // 1-bit data input (negative edge)
  .R            (   R           ),  // 1-bit reset
  .S            (   S           )   // 1-bit set
);
```
### 参数介绍
- **DDR_CLK_EDGE**：数据对齐方式，该参数将在下文介绍。
- **INIT**：初始化端口 Q 的初始值。
- **SRTYPE**：配置复位/置位信号为同步/异步。建议是使用同步复位驱动 R/S，以避免亚稳态的产生。
### 端口介绍
- **D1/D2**：数据的输入端口，D1 将会被输出到时钟的上升沿，D2 将会被输出到时钟的下降沿。
- **C**：时钟的输入端口。
- **CE**：时钟的使能信号，高电平有效。
- **Q**：DDR 信号的输出端口。
- **R/S**：复位/置位信号，只能使用其中之一 (置1)，或全部不使用 (置 0)。复位信号使得 Q1/Q2 输出置 0，置位信号使得 Q1/Q2 输出置 1。
### ODDR 数据对齐方式
- **OPPOSITE_EDGE**：在该模式下时钟的两个边沿都用于从 FPGA 逻辑捕获数据，从而实现两倍数据的吞吐量。这种方式要求内部逻辑**必须提供两个数据流**：D1 数据流**与上升沿对齐**，D2 数据流**与下降沿对齐**, (或提前半个周期来保持数据的稳定)。该方式通常要求使用下降沿的触发器来驱动，容易导致时序违例。该模式的时序图例如下。
- ![ODDR_CLK_EDGE_OPPOSITE_EDGE](../../../../../assets/img/posts/fpga_impl_interface/ethernet_impl/eth-02/ODDR_CLK_EDGE_OPPOSITE_EDGE.png)
- **SAME_EDGE**：在该模式下，D1/D2 都可以由上升沿触发的逻辑产生，DDR 内部会自动把 D2 对齐到下降沿进行输出，从而避免了跨边沿的约束，时序宽松，设计更加简单。该模式的图例如下。
- ![ODDR_CLK_EDGE_SAME_EDGE](../../../../../assets/img/posts/fpga_impl_interface/ethernet_impl/eth-02/ODDR_CLK_EDGE_SAME_EDGE.png)
## TX_CTRL 的转换
在 RGMII 接口中，`TX_CTL`是一个集成了 GMII 接口中 `TX_EN`(发送使能) 和 `TX_ER`(发送错误) 功能的复合信号，通过将这两个信号编码在了同一个时钟周期内，传递了两个控制信息。

`TX_CTL` 采用的同样也是**双边沿采样 (DDR)**，配合发送时钟 `TXC` 一起传输。它的编码规则如下：
- **上升沿**：传输 `TX_EN` 信号，表示该时钟周期内的数据是否有效。
- **下降沿**：传输 `TX_EN ^ TX_ER`，即 `TX_EN ^ TX_ER` 的**异或 (XOR) 结果**。
这种编码方式定义了四种明确的状态：

|     组合场景      | GMII: TX_EN | GMII_TX_ER | RGMII: TX_CTL<br>(上升沿) | RGMII: TX_CTL<br>(下降沿) |              状态描述               |
| :-----------: | :---------: | :--------: | :--------------------: | :--------------------: | :-----------------------------: |
| 正常帧间隙<br>(空闲) |      0      |     0      |           0            |           0            |   空闲状态。链路无数据传输，`TX_CTL`保持低电平    |
|     正常帧传输     |      1      |     0      |           1            |           1            | **正常数据传输**。表示当前时钟周期的 8 位数据全部有效  |
|   **数据错误**    |      1      |     1      |           1            |           0            | **发送错误**。指示当前传输帧中存在错误，通常由MAC层发起 |
|     保留/异常     |      0      |     1      |           0            |           1            |         无效的组合，实际过程中用不到          |

${note [info]
在标准操作中，大多数应用只需要关注`正常帧传输`（上升沿=1，下降沿=1）和`数据错误`（上升沿=1，下降沿=0）这两种情况。
}

关于 `TX_CTL` 信号的产生方式，代码如下：
```verilog
ODDR #(
    .DDR_CLK_EDGE   (   "SAME_EDGE"     ),  //  "OPPOSITE_EDGE" or "SAME_EDGE" 
    .INIT           (   1'b0            ),  //  Initial value of Q: 1'b0 or 1'b1
    .SRTYPE         (   "SYNC"          )   //  Set/Reset type: "SYNC" or "ASYNC" 
) rgmii_tdv_oddr_inst (
    .Q              (   rgmii_tx_ctl    ),  //  1-bit DDR output
    .C              (   gmii_txc        ),  //  1-bit clock input
    .CE             (   1'b1            ),  //  1-bit clock enable input
    .D1             (   gmii_tx_en      ),  //  1-bit data input (positive edge)
    .D2             (   gmii_tx_en      ),  //  1-bit data input (negative edge) 实际上发送时 tx_ctl 信号一直都是拉高的，所以下降沿也接到了 gmii_tx_en 信号上。
    .R              (   1'b0            ),  //  1-bit reset
    .S              (   1'b0            )   //  1-bit set
);
```
## RGMII 接口与 GMII 接口互相转换的代码实现
### GMII 转 RGMII
首先来实现 GMII 转 RGMII 接口，这样 FPGA 侧的逻辑就可以通过 GMII 接口发送，再由该模块转换成 RGMII 接口的数据传递到 PHY 芯片了。
```verilog
module rgmii_tx (
    // GMII
    input   wire            gmii_txc        ,   //  [I] [   ] gmii rx clock
    input   wire            gmii_tx_en      ,   //  [I] [   ] gmii rx control
    input   wire    [7:0]   gmii_txd        ,   //  [I] [7:0] gmii rx data

    // RGMII
    output  wire            rgmii_txc       ,   //  [O] [   ] rgmii rx clock
    output  wire            rgmii_tx_ctl    ,   //  [O] [   ] rgmii rx control
    output  wire    [3:0]   rgmii_txd           //  [O] [3:0] rgmii rx data
);

// RGMII 接口 tx_ctl 信号的产生
ODDR #(
    .DDR_CLK_EDGE   (   "SAME_EDGE"     ),  //  "OPPOSITE_EDGE" or "SAME_EDGE" 
    .INIT           (   1'b0            ),  //  Initial value of Q: 1'b0 or 1'b1
    .SRTYPE         (   "SYNC"          )   //  Set/Reset type: "SYNC" or "ASYNC" 
) rgmii_tdv_oddr_inst (
    .Q              (   rgmii_tx_ctl    ),  //  1-bit DDR output
    .C              (   gmii_txc        ),  //  1-bit clock input
    .CE             (   1'b1            ),  //  1-bit clock enable input
    .D1             (   gmii_tx_en      ),  //  1-bit data input (positive edge)
    .D2             (   gmii_tx_en      ),  //  1-bit data input (negative edge)
    .R              (   1'b0            ),  //  1-bit reset
    .S              (   1'b0            )   //  1-bit set
);

// generate 语句为每一条数据线都生成 ODDR 原语
genvar i;
generate 
    for (i=0; i<4; i=i+1) 
    begin: txd_bus
        ODDR #(
            .DDR_CLK_EDGE  (    "SAME_EDGE"     ),  //  "OPPOSITE_EDGE" or "SAME_EDGE" 
            .INIT          (    1'b0            ),  //  Initial value of Q: 1'b0 or 1'b1
            .SRTYPE        (    "SYNC"          )   //  Set/Reset type: "SYNC" or "ASYNC" 
        ) rgmii_txd_oddr_inst (
            .Q             (    rgmii_txd[i]    ),  //  1-bit DDR output
            .C             (    gmii_txc        ),  //  1-bit clock input
            .CE            (    1'b1            ),  //  1-bit clock enable input
            .D1            (    gmii_txd[i  ]   ),  //  1-bit data input (positive edge)
            .D2            (    gmii_txd[i+4]   ),  //  1-bit data input (negative edge) 在 RGMII 接口的要求中，时钟的上升沿发送高 4 位，下降沿发送低 4 位。
            .R             (    1'b0            ),  //  1-bit reset
            .S             (    1'b0            )   //  1-bit set
        );   
    end
endgenerate

// 使用 ODDR 原语生成 rgmii_txc 来匹配延迟
ODDR #(
    .DDR_CLK_EDGE   (   "SAME_EDGE"     ),  //  "OPPOSITE_EDGE" or "SAME_EDGE" 
    .INIT           (   1'b0            ),  //  Initial value of Q: 1'b0 or 1'b1
    .SRTYPE         (   "SYNC"          )   //  Set/Reset type: "SYNC" or "ASYNC" 
) rgmii_clk_oddr_inst (
    .Q              (   rgmii_txc       ),  //  1-bit DDR output
    .C              (   gmii_txc        ),  //  1-bit clock input
    .CE             (   1'b1            ),  //  1-bit clock enable input
    .D1             (   1'b1            ),  //  1-bit data input (positive edge)
    .D2             (   1'b0            ),  //  1-bit data input (negative edge)
    .R              (   1'b0            ),  //  1-bit reset
    .S              (   1'b0            )   //  1-bit set
);
```
### RGMII 转 GMII
```verilog
module rgmii_rx (
    // RGMII
    input   wire            rgmii_rxc       ,   //  [I] [   ] rgmii rx clock
    input   wire            rgmii_rx_ctl    ,   //  [I] [   ] rgmii rx control
    input   wire    [3:0]   rgmii_rxd       ,   //  [I] [3:0] rgmii rx data

    // GMII
    output  wire            gmii_rxc        ,   //  [O] [   ] gmii rx clock
    output  wire            gmii_rx_dv      ,   //  [O] [   ] gmii rx data valid
    output  wire    [7:0]   gmii_rxd            //  [O] [7:0] gmii rx data
);

wire            rgmii_rxc_bufio     ;
wire            rgmii_rxc_bufg      ;
wire    [1:0]   gmii_rx_dv_t        ;
assign gmii_rxc     = rgmii_rxc_bufg                    ;
assign gmii_rx_dv   = gmii_rx_dv_t[0] & gmii_rx_dv_t[1] ;

BUFG BUFG_inst (
    .I              (   rgmii_rxc               ),
    .O              (   rgmii_rxc_bufg          )
);

BUFIO BUFIO_inst (
    .I              (   rgmii_rxc               ),
    .O              (   rgmii_rxc_bufio         )
);

genvar i;
generate
    for (i = 0; i < 4; i = i+1)
    begin: rxd_bus
        // input delay
        IDDR #(
            .DDR_CLK_EDGE   (   "SAME_EDGE_PIPELINED"   ),  //  "OPPOSITE_EDGE", "SAME_EDGE" or "SAME_EDGE_PIPELINED" 
            .INIT_Q1        (   1'b0                    ),  //  Initial value of Q1: 1'b0 or 1'b1
            .INIT_Q2        (   1'b0                    ),  //  Initial value of Q2: 1'b0 or 1'b1
            .SRTYPE         (   "SYNC"                  )   //  Set/Reset type: "SYNC" or "ASYNC" 
        ) gmii_rxd_iddr (
            .Q1             (   gmii_rxd[i  ]           ),  // [O] 1-bit output for positive edge of clock
            .Q2             (   gmii_rxd[i+4]           ),  // [O] 1-bit output for negative edge of clock
            .C              (   rgmii_rxc_bufio         ),  // [I] 1-bit clock input
            .CE             (   1'b1                    ),  // [I] 1-bit clock enable input
            .D              (   rgmii_rxd[i]            ),  // [I] 1-bit DDR data input
            .R              (   1'b0                    ),  // [I] 1-bit reset
            .S              (   1'b0                    )   // [I] 1-bit set
        );
    end
endgenerate
```

