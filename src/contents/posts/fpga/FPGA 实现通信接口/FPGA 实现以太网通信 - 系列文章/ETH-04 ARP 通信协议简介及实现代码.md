---
title: ETH-04 ARP 通信协议简介及实现代码
published: 2026-04-16 11:25:17
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 经验分享
category: FPGA
postID: 424a6d95 # 自动生成, 不要修改这个项目的值
---

### ARP 协议简介
**ARP（Address Resolution Protocol，地址解析协议）** 是一种根据 IP 地址 (逻辑地址) 获取 MAC 地址 (物理地址) 的 TCP/IP 协议。

在以太网环境中，设备之间的通信**依赖于 MAC 地址**，但上层应用通常**只知道目标设备的 IP 地址**。ARP 协议通过 "一问一答" 的机制，解决了 "**已知 IP 地址，如何找到对应 MAC 地址**" 的问题，确保数据能够正确封装并送达目标设备。

![ARP 协议图](/img/posts/fpga_impl_interface/ethernet_impl/eth-04/arp_block_diagram.png)

其工作过程简述如下：主机 A 发送数据时，按照以太网帧格式封装，但将目标 MAC 地址设置为**广播地址（FF:FF:FF:FF:FF:FF）**。这样，局域网内所有主机都会收到该数据包。只有 IP 地址与目标匹配的主机 B 会响应，将自己的 MAC 地址发送给主机 A，从而完成地址解析。其他非对应 IP 的主机则自动忽略该广播包。

> **补充说明：TCP/IP 协议簇**  
> TCP/IP 是互联网的核心通信协议，它并非单一的协议，而是一个协议簇 (协议集合) ，定义了设备之间如何联网和通信。其名称来源于其中最著名的两个协议：**TCP** (传输控制协议) 和 **IP** (互联网协议)。ARP 正是这个协议簇中的一员。
### ARP 请求
当主机需要与目标 IP 通信，但不知道目标 IP 的 MAC 地址时，会构造 ARP 请求报文，并**以广播的方式（目标 MAC 地址为 FF:FF:FF:FF:FF:FF）发送到整个局域网**

 特点：**广播发送**，局域网内所有的设备都会收到这个数据包，但**只有目标 IP 地址匹配的设备才会处理** 
### ARP 应答
当目标设备收到 ARP 请求后，发现目标 IP 与自己的 IP 匹配，会构造 ARP 应答报文，并**以单播的方式直接回复给请求方。**

特点：**单播发送**，同时目标设备也会将请求方的 IP-MAC 映射记录到自己的 ARP 缓存中。
### ARP 协议数据格式
#### 以太网帧格式
ARP 协议的以太网帧数据格式如下图所示，ARP 数据位于以太网数据帧中的数据段部分。
![ARP 协议 MAC 帧](/img/posts/fpga_impl_interface/ethernet_impl/eth-04/arp_format_mac.png)
#### ARP 数据报格式
ARP 数据报位于以太网帧中的数据段中，它的格式如下图所示。
![ARP 数据报格式](/img/posts/fpga_impl_interface/ethernet_impl/eth-04/arp_format.png)
- **硬件类型**：指定底层网络硬件类型。对于以太网，值为 **1 `(0x0001)`**。
- **协议类型**：要映射的协议地址类型，**ARP协议的上层协议为IP协议**，因此该协议类型为IP协议，其值为 0x0800。
- **硬件地址长度**：硬件地址（MAC地址）的长度，以字节为单位。对于以太网上 IP 地址的 ARP 请求或者应答来说，该值为6。
- **协议地址长度**：IP 地址的长度，以字节为单位。对于以太网上 IP 地址的 ARP 请求或者应答来说，该值为4。
- **操作码 (OP)**：用于表示该数据包为 ARP 请求或者 ARP 应答。1 表示 ARP 请求，2 表示ARP 应答。
- **源 MAC 地址**：**发送端**的 MAC 地址，即硬件地址
- **源 IP 地址**： **发送端**的 IP 地址，即协议地址
- **目的 MAC 地址**：**接收端**的 MAC 地址，即硬件地址
- **目的 IP 地址**： **接收端**的 IP 地址，即协议地址
### 实现代码
基于之前文章 [ETH-03 以太网帧结构介绍以及 Verilog 实现代码](ETH-03%20以太网帧结构介绍以及%20Verilog%20实现代码.md) 中的以太网帧封包模块，我们只需要向模块中发送数据段的 ARP 数据即可。
#### ARP 发送模块
只需要发送 ARP 数据段的内容给 以太网封包模块即可。

模块工作过程：
- 上游控制模块为端口`arp_tx_en` 产生一个高电平脉冲。之后模块将在端口 `s_axis_tdv` 产生持续的高电平信号，给下游的以太网封包模块。
- 模块等待下游以太网封包模块拉高 `s_axis_trdy` 信号，之后开始发送 ARP 数据。
- 发送到最后一个字节的 ARP 数据时，产生 `s_axis_tend` 信号。

完整的实现代码如下：
已折叠部分代码
```verilog  collapse={35-179}
module arp_tx (
    input   wire            clk             ,   //  [I] [     ] module clock
    input   wire            rst_n           ,   //  [I] [     ] module reset, active-low
    input   wire            arp_tx_en       ,   //  [I] [     ] ARP TX enable signal, active-high pulse signal
    input   wire            arp_tx_type     ,   //  [I] [     ] ARP TX type, 1'b0: ARP req, 1'b1: ARP ack

    input   wire    [47:0]  tx_src_mac      ,   //  [I] [47:00] Source MAC address to be send
    input   wire    [47:0]  tx_dst_mac      ,   //  [I] [47:00] Destination MAC address to be send
    input   wire    [31:0]  tx_src_ip       ,   //  [I] [31:00] Source IP address to be send
    input   wire    [31:0]  tx_dst_ip       ,   //  [I] [31:00] Destination IP address to be send

    // downstream: ethernet pack encapsulation
    input   wire            encap_busy      ,   //  [I] [     ] encapsulation module busy state input, we only send arp packet when this signal is 1'b0    
    output  reg     [7:0]   s_axis_td       ,   //  [O] [07:00] axis send data output to encapsulation module
    output  reg             s_axis_tdv      ,   //  [O] [     ] axis send data valid output to encapsulation module
    output  reg             s_axis_tend     ,   //  [O] [     ] axis send tend output to encapsulation module
    input   wire            s_axis_trdy         //  [I] [     ] axis send ready signal
);

//================================================================================
// Local Parameter Declarations
//================================================================================
// states define
localparam  ST_IDLE         =   2'd0        ;
localparam  ST_ARP_DATA     =   2'd1        ;
localparam  ST_ARP_END      =   2'd2        ;

// local parameters
localparam  ETH_TYPE        =   16'h0806    ;
localparam  HD_TYPE         =   16'h0001    ;
localparam  PROTOCOL_TYPE   =   16'h0800    ;
localparam  MAC_ADD_LEN     =   8'h06       ;
localparam  IP_ADD_LEN      =   8'h04       ;
localparam  OP_CODE         =   16'h0001    ;

localparam  PREAMBLE_WORD   =   8'h55       ;
localparam  SFD_WORD        =   8'hd5       ;

//================================================================================
// Register Declarations
//================================================================================
reg [1:0]   state               ;
reg [7:0]   arp_data    [27:0]  ;
reg [4:0]   arp_cnt             ;

reg [2:0]   arp_tx_en_sr        ;
reg         arp_tx_en_latch     ;

//================================================================================
// Wire Declarations
//================================================================================
wire        arp_tx_en_pulse     ;

//================================================================================
// Assign Declarations
//================================================================================
assign  arp_tx_en_pulse = {arp_tx_en_sr[0] & !arp_tx_en_sr[1]};

//================================================================================
// MAIN CODE
//================================================================================

// sync arp_tx_en signal
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        arp_tx_en_sr <= 3'b000  ;
    end else begin
        arp_tx_en_sr <= {arp_tx_en_sr[1:0], arp_tx_en}  ;
    end
end

always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        arp_data[00]    <=  HD_TYPE[15:08]      ;
        arp_data[01]    <=  HD_TYPE[07:00]      ;
        arp_data[02]    <=  PROTOCOL_TYPE[15:08];
        arp_data[03]    <=  PROTOCOL_TYPE[07:00];
        arp_data[04]    <=  MAC_ADD_LEN         ;
        arp_data[05]    <=  IP_ADD_LEN          ;
        arp_data[06]    <=  OP_CODE[15:08]      ;
        arp_data[07]    <=  OP_CODE[07:00]      ;
        arp_data[08]    <=  8'b00   ;
        arp_data[09]    <=  8'b00   ;
        arp_data[10]    <=  8'b00   ;
        arp_data[11]    <=  8'b00   ;
        arp_data[12]    <=  8'b00   ;
        arp_data[13]    <=  8'b00   ;
        arp_data[14]    <=  8'b00   ;
        arp_data[15]    <=  8'b00   ;
        arp_data[16]    <=  8'b00   ;
        arp_data[17]    <=  8'b00   ;
        arp_data[18]    <=  8'b00   ;
        arp_data[19]    <=  8'b00   ;
        arp_data[20]    <=  8'b00   ;
        arp_data[21]    <=  8'b00   ;
        arp_data[22]    <=  8'b00   ;
        arp_data[23]    <=  8'b00   ;
        arp_data[24]    <=  8'b00   ;
        arp_data[25]    <=  8'b00   ;
        arp_data[26]    <=  8'b00   ;
        arp_data[27]    <=  8'b00   ;

        s_axis_tdv      <=  1'b0    ;
        arp_tx_en_latch <=  1'b0    ;
        s_axis_tend     <=  1'b0    ;
        s_axis_td       <=  8'b0    ;
        arp_cnt         <=  5'd0    ;
        state           <=  ST_IDLE ;
    end else begin
        if (arp_tx_en_pulse) arp_tx_en_latch  <=  1'b1        ;

        case (state)
            ST_IDLE: begin
                s_axis_tend <=  1'b0    ;
                s_axis_td   <=  8'b0    ;
                arp_cnt     <=  5'd0    ;
                s_axis_tdv  <=  1'b0    ;
                if ((arp_tx_en_latch == 1'b1) && (encap_busy == 1'b0)) begin
                    arp_tx_en_latch <=  1'b0                ;
                    arp_data[08]    <=  tx_src_mac[47:40]   ;
                    arp_data[09]    <=  tx_src_mac[39:32]   ;
                    arp_data[10]    <=  tx_src_mac[31:24]   ;
                    arp_data[11]    <=  tx_src_mac[23:16]   ;
                    arp_data[12]    <=  tx_src_mac[15:08]   ;
                    arp_data[13]    <=  tx_src_mac[07:00]   ;
                    arp_data[14]    <=  tx_src_ip [31:24]   ;
                    arp_data[15]    <=  tx_src_ip [23:16]   ;
                    arp_data[16]    <=  tx_src_ip [15:08]   ;
                    arp_data[17]    <=  tx_src_ip [07:00]   ;
                    arp_data[18]    <=  tx_dst_mac[47:40]   ;
                    arp_data[19]    <=  tx_dst_mac[39:32]   ;
                    arp_data[20]    <=  tx_dst_mac[31:24]   ;
                    arp_data[21]    <=  tx_dst_mac[23:16]   ;
                    arp_data[22]    <=  tx_dst_mac[15:08]   ;
                    arp_data[23]    <=  tx_dst_mac[07:00]   ;
                    arp_data[24]    <=  tx_dst_ip [31:24]   ;
                    arp_data[25]    <=  tx_dst_ip [23:16]   ;
                    arp_data[26]    <=  tx_dst_ip [15:08]   ;
                    arp_data[27]    <=  tx_dst_ip [07:00]   ;

                    if (arp_tx_type == 1'b0) begin
                        arp_data[7]     <=  8'h01   ;
                        arp_data[18]    <=  8'h00   ;
                        arp_data[19]    <=  8'h00   ;
                        arp_data[20]    <=  8'h00   ;
                        arp_data[21]    <=  8'h00   ;
                        arp_data[22]    <=  8'h00   ;
                        arp_data[23]    <=  8'h00   ;
                    end else begin
                        arp_data[7]     <=  8'h02   ;
                    end

                    state           <=  ST_ARP_DATA     ;
                    s_axis_tdv      <=  1'b1            ;
                end
            end

            ST_ARP_DATA: begin
                if (s_axis_trdy == 1'b1) begin
                    s_axis_td   <=  arp_data[arp_cnt]   ;
                    arp_cnt     <=  arp_cnt + 1'b1      ;
                    if (arp_cnt == 5'd27) begin
                        s_axis_tend <=  1'b1            ;
                        state       <=  ST_ARP_END      ;
                    end
                end
            end

            ST_ARP_END: begin
                s_axis_tend <=  1'b0    ;
                s_axis_td   <=  8'd0    ;
                s_axis_tdv  <=  1'b0    ;
                arp_cnt     <=  5'd0    ;
                state       <=  ST_IDLE ;
            end
        endcase
    end
end

endmodule
```

#### ARP 接收模块
接收模块同样从以太网帧解包模块中接收负载数据，负载数据即为 ARP 数据内容。

模块工作过程：
- 从上游以太网帧解包模块中等待 `s_axis_rdv` 信号，表明负载数据有效。
- 开始按字节计数，将接收到的数据寄存
- 判断目的 IP 地址是否为板卡 IP 地址，如果是板卡的 IP 地址，则将寄存的源 MAC 地址输出到模块的端口，方便其它模块调用，否则将接收到的数据丢弃。
```verilog collapse={35-122}
module arp_rx (
    input   wire            clk             ,   //  [I] [     ] Module clock
    input   wire            rst_n           ,   //  [I] [     ] Module reset signal, active-low

    input   wire    [15:00] eth_type        ,   //  [I] [15:00] received ethertype
    output  reg     [47:00] src_mac         ,   //  [O] [47:00] Received source MAC address
    output  reg     [31:00] src_ip          ,   //  [O] [31:00] Received source IP address
    input   wire    [31:00] board_ip        ,   //  [I] [31:00] Input board IP address, for comparison with received destination IP address

    // upstream: ethernet pack decapsulation
    input   wire            decap_busy      ,   //  [I] [     ] decapsulation module busy state input
    input   wire    [7:0]   s_axis_rd       ,   //  [I] [07:00] axis receive data input from decapsulation module
    input   wire            s_axis_rdv      ,   //  [I] [     ] axis receive data valid input from decapsulation module
    input   wire            s_axis_rend     ,   //  [I] [     ] axis receive tend input from decapsulation module
    output  reg             s_axis_rrdy     ,   //  [O] [     ] axis receive ready signal
    
    output  reg             arp_rx_done     ,   //  [O] [     ] ARP receive done signal, active-high
    output  reg             arp_rx_type         //  [O] [     ] ARP receive type, 1'b1: ack, 1'b0: req
);

//================================================================================
// Local Parameter Declarations
//================================================================================
localparam  ST_IDLE         =   2'b00   ;
localparam  ST_ARP_DATA     =   2'b01   ;
localparam  ST_ARP_END      =   2'b10   ;

localparam  ETH_TYPE_ARP    =   16'h0806;

//================================================================================
// Register Declarations
//================================================================================
reg [47:00] dst_mac_t       ;
reg [31:00] dst_ip_t        ;
reg [47:00] src_mac_t       ;
reg [31:00] src_ip_t        ;
reg [15:00] op_data         ;

reg [01:00] state           ;
reg [04:00] data_bytes_cnt  ;

//================================================================================
// MAIN CODE
//================================================================================
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        state           <=  ST_IDLE ;
        data_bytes_cnt  <=  5'b0    ;
        s_axis_rrdy     <=  1'b0    ;
        op_data         <=  16'b0   ;
        dst_mac_t       <=  48'b0   ;
        dst_ip_t        <=  32'b0   ;
        src_mac_t       <=  48'b0   ;
        src_ip_t        <=  32'b0   ;
        src_mac         <=  48'b0   ;
        src_ip          <=  32'b0   ;
        arp_rx_done     <=  1'b0    ;
        arp_rx_type     <=  1'b0    ;
    end else begin 
        case(state) 
            ST_IDLE: begin
                data_bytes_cnt  <=  5'b0        ;
                s_axis_rrdy     <=  1'b1        ;
                arp_rx_done     <=  1'b0        ;
                
                if (
                    eth_type    ==  ETH_TYPE_ARP &&
                    s_axis_rdv  ==  1'b1        
                ) begin
                    state       <=  ST_ARP_DATA ;
                    data_bytes_cnt  <=  data_bytes_cnt + 1'b1   ;
                end else begin
                    state       <=  ST_IDLE     ;
                end
            end

            ST_ARP_DATA: begin
                data_bytes_cnt  <=  data_bytes_cnt + 1'b1           ;
                if (data_bytes_cnt >= 5'd6 && data_bytes_cnt < 5'd8) begin
                    op_data     <=  {op_data[7:0], s_axis_rd}       ;                   // OP code
                end else if (data_bytes_cnt >= 5'd8  && data_bytes_cnt < 5'd14) begin   
                    src_mac_t   <=  {src_mac_t[39:0], s_axis_rd}    ;                   // So urce MAC address
                end else if (data_bytes_cnt >= 5'd14 && data_bytes_cnt < 5'd18) begin
                    src_ip_t    <=  {src_ip_t[23:0], s_axis_rd}     ;                   // Source IP address
                end else if (data_bytes_cnt >= 5'd18 && data_bytes_cnt < 5'd24) begin
                    dst_mac_t   <=  {dst_mac_t[39:0], s_axis_rd}    ;                   // Destination MAC address
                end else if (data_bytes_cnt >= 5'd24 && data_bytes_cnt < 5'd28) begin
                    dst_ip_t    <=  {dst_ip_t[23:0], s_axis_rd}     ;                   // Destination IP address
                end else if (data_bytes_cnt >= 5'd28) begin
                    if (
                        dst_ip_t    == board_ip && 
                        ((op_data == 16'd1) || (op_data == 16'd2))
                    ) begin
                        arp_rx_done <=  1'b1        ;
                        src_mac     <=  src_mac_t   ;
                        src_ip      <=  src_ip_t    ;
                        dst_mac_t   <=  48'b0       ;
                        dst_ip_t    <=  32'b0       ;
                        src_mac_t   <=  48'b0       ;
                        src_ip_t    <=  32'b0       ;
                        if (op_data == 16'd1) begin
                            arp_rx_type <= 1'b0     ;   //  arp request
                        end else begin
                            arp_rx_type <= 1'b1     ;   //  arp ack
                        end
                        state   <=  ST_ARP_END      ;
                    end else begin
                        state   <= ST_ARP_END       ;
                    end
                end
            end

            ST_ARP_END: begin
                s_axis_rrdy     <=  1'b0            ;
                if (decap_busy == 1'b0) begin
                    state       <=  ST_IDLE         ;
                end
            end
        endcase
    end
end

endmodule
```
#### ARP 模块
这个模块是将两个模块进行整合封装到一个顶层，方便后续的例化
```verilog collapse={35-49, 53-67}
module arp (
    input                   rst_n       ,   //  [I] [     ] Module reset signal, active-low
    input                   gmii_tx_clk ,   //  [I] [     ] GMII TX clock
    input                   gmii_rx_clk ,   //  [I] [     ] GMII RX clock
    
    input   wire    [47:00] board_mac   ,   //  [I] [47:00] Input board MAC address, for comparison with received destination MAC address.
    input   wire    [31:00] board_ip    ,   //  [I] [31:00] Input board IP address, for comparison with received destination IP address.

    input   wire            decap_busy  ,   //  [I] [     ] Upstream decapsulation module busy state input
    input   wire            encap_busy  ,   //  [I] [     ] Downstream encapsulation module busy state input

    // arp rx
    input   wire    [07:00] s_axis_rd   ,   //  [I] [07:00] axis receive data input from decapsulation module
    input   wire            s_axis_rdv  ,   //  [I] [     ] axis receive data valid input from decapsulation module
    input   wire            s_axis_rend ,   //  [I] [     ] axis receive tend input from decapsulation module
    output  wire            s_axis_rrdy ,   //  [O] [     ] axis receive ready signal
    output  wire            arp_rx_done ,   //  [O] [     ] ARP receive done signal, active-high
    output  wire            arp_rx_type ,   //  [O] [     ] ARP receive type, 1'b1: ack, 1'b0: req
    input   wire    [15:00] eth_type    ,   //  [I] [15:00] received ethertype
    output  wire    [47:00] rx_src_mac  ,   //  [O] [47:00] Received source MAC address
    output  wire    [31:00] rx_src_ip   ,   //  [O] [31:00] Received source IP address

    // arp tx
    input   wire            arp_tx_en   ,   //  [I] [     ] ARP TX enable signal, active-high pulse signal
    input   wire            arp_tx_type ,   //  [I] [     ] ARP TX type, 1'b0: ARP req, 1'b1: ARP ack
    input   wire    [47:00] tx_dst_mac  ,   //  [I] [47:00] Destination MAC address to be send
    input   wire    [31:00] tx_dst_ip   ,   //  [I] [31:00] Destination IP address to be send
    output  wire    [07:00] s_axis_td   ,   //  [O] [07:00] axis send data output to encapsulation module
    output  wire            s_axis_tdv  ,   //  [O] [     ] axis send data valid output to encapsulation module
    output  wire            s_axis_tend ,   //  [O] [     ] axis send tend output to encapsulation module
    input   wire            s_axis_trdy     //  [I] [     ] axis send ready signal
);

arp_rx arp_rx_inst (
    .clk            (   gmii_rx_clk ),  //  [I] [     ] Module clock
    .rst_n          (   rst_n       ),  //  [I] [     ] Module reset signal, active-low
    
    .eth_type       (   eth_type    ),  //  [I] [15:00] received ethertype
    .src_mac        (   rx_src_mac  ),  //  [O] [47:00] Received source MAC address
    .src_ip         (   rx_src_ip   ),  //  [O] [31:00] Received source IP address
    .board_ip       (   board_ip    ),  //  [I] [31:00] Input board IP address, for comparison with received destination IP address

    .decap_busy     (   decap_busy  ),  //  [I] [     ] decapsulation module busy state input
    .s_axis_rd      (   s_axis_rd   ),  //  [I] [07:00] axis receive data input from decapsulation module
    .s_axis_rdv     (   s_axis_rdv  ),  //  [I] [     ] axis receive data valid input from decapsulation module
    .s_axis_rend    (   s_axis_rend ),  //  [I] [     ] axis receive tend input from decapsulation module
    .s_axis_rrdy    (   s_axis_rrdy ),  //  [O] [     ] axis receive ready signal
    .arp_rx_done    (   arp_rx_done ),  //  [O] [     ] ARP receive done signal, active-high
    .arp_rx_type    (   arp_rx_type )   //  [O] [     ] ARP receive type, 1'b1: ack, 1'b0: req
);

arp_tx arp_tx_inst (
    .clk            (   gmii_tx_clk ),  //  [I] [     ] Module clock
    .rst_n          (   rst_n       ),  //  [I] [     ] Module reset signal, active-low

    .tx_src_mac     (   board_mac   ),  //  [I] [47:00] Source MAC address to be send
    .tx_src_ip      (   board_ip    ),  //  [I] [31:00] Source IP address to be send
    .tx_dst_mac     (   tx_dst_mac  ),  //  [I] [47:00] Destination MAC address to be send
    .tx_dst_ip      (   tx_dst_ip   ),  //  [I] [31:00] Destination IP address to be send
    
    .encap_busy     (   encap_busy  ),  //  [I] [     ] encapsulation module busy state input, we only send arp packet when this signal is 1'b0    
    .s_axis_td      (   s_axis_td   ),  //  [O] [07:00] axis send data output to encapsulation module
    .s_axis_tdv     (   s_axis_tdv  ),  //  [O] [     ] axis send data valid output to encapsulation module
    .s_axis_tend    (   s_axis_tend ),  //  [O] [     ] axis send tend output to encapsulation module
    .s_axis_trdy    (   s_axis_trdy ),  //  [I] [     ] axis send ready signal
    .arp_tx_en      (   arp_tx_en   ),  //  [I] [     ] ARP TX enable signal, active-high pulse signal
    .arp_tx_type    (   arp_tx_type )   //  [I] [     ] ARP TX type, 1'b0: ARP req, 1'b1: ARP ack
);
```