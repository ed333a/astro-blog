---
title: ETH-01 初识以太网的硬件组成
published: 2026-04-13 15:14:06
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 经验分享
category: FPGA
postID: 4a0bb95d # 自动生成, 不要修改这个项目的值
---

### 以太网通信的硬件组成
下面是一张硬件组成图例
![以太网通信的硬件组成](/img/posts/fpga_impl_interface/ethernet_impl/eth-01/ethernet_hardware_components.png)
主要由 **MAC (Media Access Control，媒体访问控制器)** 和 **PHY(Physical Layer，物理层接口)** 两大部分组成。
- **MAC**：通常由嵌入式设备（如单片机、FPGA 等）实现，负责数据的打包、寻址、CRC 校验等逻辑控制功能。
- **PHY**：一般作为一颗**独立的板载芯片**，负责网络自协商、数据编解码等物理层相关工作。

通信设备之间通过 RJ45 接口进行连接。需要注意的是，**接口本身不具备通信功能**，仅起到连接信号的作用。
### RGMII 和 GMII 接口
RGMII 和 GMII 都是连接 MAC 层与 PHY 层的芯片间接口，主要区别在于引脚数量和传输效率。
#### GMII (Gigabit Media Independent Interface)
GMII 是千兆以太网接口的完整实现，也是早期 MII 接口的升级版（MII 最高支持 100Mbps）。
![GMII 接口](/img/posts/fpga_impl_interface/ethernet_impl/eth-01/gmii_interface.png)
- **数据宽度**：8 位（发送和接收各 8 条数据线）
- **时钟频率**：
    - 1000 Mbps 模式：125 MHz
    - 100 Mbps 模式：25 MHz
    - 10 Mbps 模式：2.5 MHz
- **关键信号**：
    - `TXD[7:0]`（发送数据）、`RXD[7:0]`（接收数据）
    - `TX_CLK` / `RX_CLK`（时钟，由 PHY 提供或从数据中恢复）
    - `TX_EN`（发送使能）、`RX_DV`（接收数据有效）
    - `TX_ER` / `RX_ER`（错误指示）
    - `CRS`（载波侦听）、`COL`（冲突检测，仅半双工用）
- **优点**：时序简单，兼容性好，支持全双工和半双工。
- **缺点**：引脚数量多，约 **24 根**，PCB 布线复杂，成本高。
- **应用场景**：早期千兆交换芯片、FPGA 开发板、对时序要求极高的场合。
> **注意**：GMII 的发送时钟 `TX_CLK` 可能来自 MAC，也可能来自 PHY（取决于模式），这一点与 MII 略有差异。
#### RGMII (Reduced GMII)
RGMII 是为了解决 GMII 引脚过多问题而设计的**精简版**接口，是目前大多数 SoC、交换芯片和 PHY 芯片的首选。它采用的是 **DDR(Double Data Rate)** 模式传输的数据，即时钟的上升沿和下降沿均为有效数据。 
![RGMII 接口](/img/posts/fpga_impl_interface/ethernet_impl/eth-01/rgmii_interface.png)
- **数据宽度**：4 位（发送和接收各 4 条数据线）
- **时钟频率**：
    - 1000 Mbps 模式：125 MHz（双沿采样，等效 250 Mbps per pin）
    - 100 Mbps 模式：25 MHz（双沿采样，等效 50 Mbps per pin）
    - 10 Mbps 模式：2.5 MHz（双沿采样，等效 5 Mbps per pin）
- **核心技术**：**DDR(Double Data Rate)——时钟的上升沿和下降沿均传输数据。其中上升沿传递数据的高 4 位，下降沿传递数据的低 4 位**。所以 4 位数据线 x 双边沿 x 125MHz = 1000Mbps。
- **关键信号**：
    - `TXD[3:0]`（发送数据）、`RXD[3:0]`（接收数据）
    - `TX_CLK`（125MHz 时钟，由 MAC 或 PHY 提供）
    - `RX_CLK`（125MHz 时钟，由 PHY 恢复）
    - `TX_CTL`（发送控制，上升沿 = TX_EN，下降沿 = TX_ER 或其它编码）
    - `RX_CTL`（接收控制，上升沿 = RX_DV，下降沿 = RX_ER）
- **优点**：引脚数少，约 **12 根**，仅为 GMII 的一半，PCB 布局更轻松。
- **缺点**：
    - 时序要求严格，因为用到了双沿和信号编码。
    - 通常需要 PCB 上做**等长走线**，并且 MAC/PHY 内部要有时钟延迟调整功能（一般通过 RGMII TX/RX Delay 配置）。
- **应用场景**：绝大多数现代嵌入式处理器、以太网交换机芯片、路由器、网卡。
### 实现以太网通信的模块框图 (UDP 通信)
模块以实现 UDP 回环测试为目标，整体模块框图如下图所示。
接下来的系列文章根据以下模块框图逐步推进。
![UDP 通信模块框图](/img/posts/fpga_impl_interface/ethernet_impl/eth-01/udp_module_diagram.png)
**注意**：`Protocol SW` 模块的作用是在 ARP 协议与 IP 协议之间进行切换。若将 ARP 协议和 IP 协议直接连接到 MAC 发送层，会**导致多重驱动问题**，这在 FPGA 设计中是不允许的。

> 简单来说，`Protocol SW` 模块正是**为了避免因多重驱动而引发时序违例**所设计的。
### 小结
以太网的硬件设计离不开 MAC 与 PHY 的协同工作，而 GMII 与 RGMII 作为两者之间的主流接口，分别在高性能与高集成度之间提供了不同的选择。GMII 以完整的 8 位数据线和简单的时序控制，适合对时序要求严苛的早期设备或开发平台；RGMII 则通过 DDR 技术和引脚精简，成为当前嵌入式系统中最常用的接口标准。理解这些接口的特性，有助于在实际项目中进行合理的芯片选型和 PCB 设计，从而在性能、成本与布线复杂度之间取得平衡。