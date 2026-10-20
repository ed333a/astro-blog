---
title: ETH-05 以太网 IP 协议介绍以及 Verilog 实现代码
published: 2026-06-04 16:51:35
draft: false
tags:
  - FPGA
  - Verilog
  - 嵌入式
  - 经验分享
category: FPGA
postID: dda32b50 # 自动生成, 不要修改这个项目的值
---

### IP 协议简介
**IP 协议**（Internet Protocol）是互联网的核心网络层协议。它负责**为数据包分配源(Source) IP 地址** 和**目标 (Destination) IP 地址**, 并通过路由功能在不同网络节点间转发数据。它采用“尽力而为”的不可靠、无连接传输模式, 不保证数据包顺序或可靠性。而保证数据报顺序或可靠性的任务是由其上层协议 (如 TCP) 处理的。当前主要的 IP 协议版本为 IPv4 和 IPv6。

IP 协议目前常用的上层协议如下:
- **ICMP**: 全称: **I**nternet **C**ontrol **M**essage **P**rotocol, 互联网控制报文协议。主要作用是帮助管理和控制网络通信, 提供网络诊断功能, 以及报告错误信息和网络是否可达等。
- **UDP**: 全称: **U**ser **D**atagram **P**rotocol, 用户数据协议。这是一种无连接、简单高效的传输层协议。
- **TCP**: 全称: **T**ransmission **C**ontrol **P**rotocol, 传输控制协议。是一种面向连接的、可靠的字节流传输协议, 广泛应用于互联网数据传输。
以上三种协议都是基于 **IP 协议** 运行的。
### IP 协议格式
#### MAC 帧
![MAC-FRAME](/img/posts/fpga_impl_interface/ethernet_impl/eth-05/mac-frame.png)
#### IP 首部格式
![](/img/posts/fpga_impl_interface/ethernet_impl/eth-05/ip-format.png)
- **版本 (4 bits)**: IP 版本号, IPv4 = 4, IPv6 = 6.
- **首部长度 (4 bits)**: 以 32bit (4 字节) 为一个单位的首部长度, 首部长度一般填 5, 即 20 字节的长度.
- **服务类型 (8 bits)**: 默认为 0 就行, 用于一般服务.
- **总长度 (16 bits)**: **整个 IP 数据报的长度** (首部 + 数据段), 以**字节**为单位.
- **标识 (16 bits)**: 标识符, 用于分片重组
- **标志 (3 bits)**: 
	- bit2: 保留位
	- bit1: 填 1 表示禁止分片, 填 0 表示允许分片
	- bit0: 若为分片包的最后一个包就填0, 否则为 1
- **片偏移 (13 bits)**: 用于接收端重组报文
- **生存时间 (8 bits)**: 英文简称 **TTL**(**T**ime **T**o **L**ive), 指 IP 报文在网络传输中可以通过网络交换机的次数, 若超过这个次数则交换机会将本次的 IP 报丢弃。作用是防止 IP 数据报在网络中长时间传输导致网络瘫痪。常用值: 64/128
- **协议 (4 bits)**: 上层协议 (ICMP=1, TCP=6, UDP=17)
- **首部校验和**: 首部校验和, 计算方式在下文, 快捷链接: [[首部校验和计算方法]](#首部校验和计算方法)
- **源 IP 地址**: 发送方的 IP 地址
- **目的 IP 地址**: 接收方的 IP 地址
- **可选字段**: 可变, 0-40 字节的长度, 需对齐至 32 位 (4字节) 边界。但在现代网络通信中这段内容几乎用不到。
- **负载数据**: 用户传输的负载数据, ICMP、UDP、TCP 的首部数据和负载数据均在这段内容中。
### 首部校验和计算方法
IP 首部校验和用于检测 IP 数据报首部在传输过程中是否出现错误。它只覆盖 IP 首部（不包括数据部分）, 且采用 **16 位反码求和** 算法。

假设我们的 IP 首部数据经过填充后如下图所示。
![](/img/posts/fpga_impl_interface/ethernet_impl/eth-05/ip-header-filled.png)
#### 计算前的准备
1. **将校验和字段清零**: 在计算校验和之前, IP 首部中的 "首部校验和" 字段 (16 位) 必须设置为 `0x0000`, 保证此段不参与计算。
2. **将所有数据按照每 16-bit(2 字节) 为划分为一个半字(Half-Word)**: 将整个 IP 首部 (通常是 20 字节, 不含选项, 或更多带选项的情况) 按每 2 字节为一个单位, 拆分成若干个 **半字**。
#### 计算步骤

1. **累加所有的半字**: 将所有这些 16 位数值进行普通的**二进制加法** (允许进位到 17 位或更高, 并非取模值)。

以下是计算示例 (箭头所指的值为上一步骤的计算结果): 
```text
0x4500 + 0x003C = 0x453C
-> 0x453C + 0x0000 = 0x453C
-> 0x453C + 0x4000 = 0x853C
-> 0x853C + 0x4001 = 0xC53D
-> 0xC53D + 0x0000 = 0xC53D
-> 0xC53D + 0xC0A8 = 0x185E5   (产生进位, 结果是 0x185E5, 即高 16 位 = 0x0001, 低 16 位 = 0x85E5)
-> 0x185E5 + 0x0166 = 0x1874B   (高 16 位 = 0x0001, 低 16 位 = 0x874B)
-> 0x1874B + 0xC0A8 = 0x247F3   (高 16 位 = 0x0002, 低 16 位 = 0x47F3)
-> 0x247F3 + 0x010A = 0x248FD   (高 16 位 = 0x0002, 低 16 位 = 0x48FD)
```
最终累加结果为 `0x2_48FD` (即高 16 位 `0x0002`, 低 16 位 `0x48FD`)。

2. **处理进位**: 如果高 16 位不为 0, 则将其与低 16 位相加, 重复此步骤直到高 16 位结果为 0。
```text
0x0002 + 0x48FD = 0x48FF
```
此时高 16 位为 `0x0000`, 停止计算。中间结果 `0x48FF` 称为 **反码求和** 的中间值。

3. **按位取反**: 将最终的 16 位中间值 `0x48FF` 按位取反: `~0x48FF = 0xB700`, 由此我们得到了最终的校验和 `0xB700`, 这个值就是需要填入 IP 首部校验和字段的值。
#### 为什么要折叠进位？
普通的加法会产生进位, 而反码求和算法通过把进位加回到低位, 保证了最终结果是一个 16 位数, 并且这种操作等价于 **以 65535 为模的补码加法**。  
这样设计的好处是: 接收方可以用同样的方法计算 (包括校验和字段在内), 如果最终结果是 `0xFFFF`, 则说明首部无错。

#### 接收方的验证方法
接收方收到 IP 数据报后, 也将整个首部 (包含校验和字段在内)  **用相同的方法进行 16 位反码求和**。
- 若首部没有错误, 计算得到的最终结果应该是 `0xFFFF`。
- 如果不是 `0xFFFF`, 则接收方应该丢弃这个数据报 (或通知上层)。

下面是**接收方**计算示例:
```text
0x4500 + 0x003C = 0x453C
-> 0x453C + 0x0000 = 0x453C
-> 0x453C + 0x4000 = 0x853C
-> 0x853C + 0x4001 = 0xC53D
-> 0xC53D + 0xB700 = 0x17C3D   (0xB700: 在接收方参与和计算, 高 16 位 = 0x0001, 低 16 位 = 0x7C3D)
-> 0x17C3D + 0xC0A8 = 0x23CE5  (高 16 位 = 0x0002, 低 16 位 = 0x3CE5)
-> 0x23CE5 + 0x0166 = 0x23E4B  (高 16 位 = 0x0002, 低 16 位 = 0x3E4B)
-> 0x23E4B + 0xC0A8 = 0x2FEF3  (高 16 位 = 0x0002, 低 16 位 = 0xFEF3)
-> 0x2FEF3 + 0x010A = 0x2FFFD  (高 16 位 = 0x0002, 低 16 位 = 0xFFFD)
```
将高 16 位结果和低 16 位结果相加取和得到最终结果 `0xFFFF`, 表明首部数据没有错误。
```text
0x0002 + 0xFFFD = 0xFFFF
```
### 实现代码
#### IP 解包模块
其工作方式同样是流式握手控制协议。从这部分开始的模块有两个握手接口, 一个是与上游的网络解包模块接口握手来接收包含 IP 首部和负载的数据, 模块负责从中分离 IP 首部并解析; 另外一个握手接口是与下游模块 (通常是 IP 协议的上层协议模块, 如 UDP、TCP) 握手发送数据, 将 IP 数据段中的负载数据发送给下游模块。

这里偷懒了没做接收方的数据校验😜。有能力的朋友可以自己做一下, 后面有时间的话我再实现吧。
```verilog collapse={30-175}
module ip_decap(
    input   wire            clk                 ,   //  [I] [     ] Module clock
    input   wire            rst_n               ,   //  [I] [     ] Module reset signal, active-low

    input   wire    [15:00] eth_type            ,   //  [I] [15:00] received ethertype
    input   wire    [31:00] board_ip            ,   //  [I] [31:00] board ip address, for comparison whith received destination ip address
    
    // upstream: ethernet pack decapsulation
    input   wire            decap_busy          ,   //  [I] [     ] decapsulation module busy state input
    input   wire    [07:00] s_axis_rd           ,   //  [I] [07:00] axis receive data input from decapsulation module
    input   wire            s_axis_rdv          ,   //  [I] [     ] axis receive data valid input from decapsulation module
    input   wire            s_axis_rend         ,   //  [I] [     ] axis receive tend input from decapsulation module
    output  reg             s_axis_rrdy         ,   //  [O] [     ] axis receive ready signal

    // Received IP payload output, to downstream: tcp/udp/icmp
    input   wire            s_ip_axis_rrdy      ,   //  [I] [     ] IP downstream rx ready
    output  reg     [07:00] s_ip_axis_rd        ,   //  [O] [07:00] IP data received output
    output  reg             s_ip_axis_rdv       ,   //  [O] [     ] IP data valid output, active-high
    output  reg             s_ip_axis_rend      ,   //  [O] [     ] IP data output end

    // IP Header output
    output  reg             ip_valid            ,   //  [O] [     ] Active-high only received destination ip address is board-ip
    output  reg     [03:00] ip_version          ,   //  [O] [03:00] IP version, 4'b4: ipv4, 4'b6: ipv6
    output  reg     [03:00] ip_header_len       ,   //  [O] [03:00] IP header length, In units of 32 bits (4 bytes).
    output  reg     [07:00] ip_tos              ,   //  [O] [07:00] IP type of service
    output  reg     [15:00] ip_total_len        ,   //  [O] [15:00] IP total length (include payload)
    output  reg     [15:00] ip_id               ,   //  [O] [15:00] IP identification
    output  reg     [02:00] ip_flag             ,   //  [O] [02:00] IP Flag, bit2: reserved, bit1: 1'b1 is allowing fragmentation, else disallowing. bit0: 1'b1 is more frame, 1'b0 is the last frame.
    output  reg     [12:00] ip_fragment_offset  ,   //  [O] [12:00] IP fragment offset
    output  reg     [07:00] ip_ttl              ,   //  [O] [07:00] IP time to live
    output  reg     [07:00] ip_ul_protocol      ,   //  [O] [07:00] IP upper-layer protocol (ICMP = 8'd1, TCP=8'd6, UDp=8'd17)
    output  reg     [15:00] ip_checksum         ,   //  [O] [15:00] IP checksum
    output  reg     [31:00] ip_src_addr         ,   //  [O] [31:00] Source ip address
    output  reg     [31:00] ip_dst_addr             //  [O] [31:00] Destination ip address
);

//================================================================================
// Local Parameter Declarations
//================================================================================
localparam  IP_ETH_TYPE =   16'h0800    ;

// state defines
localparam  ST_IDLE         =   3'd0    ;
localparam  ST_IP_HEADER    =   3'd1    ;
localparam  ST_IP_PAYLOAD   =   3'd2    ;
localparam  ST_IP_END       =   3'd3    ;

//================================================================================
// Register Declarations
//================================================================================
reg [03:00] state           ;
reg [15:00] bytes_rx_cnt    ; 

//================================================================================
// Wire Declarations
//================================================================================

//================================================================================
// Assign Declarations
//================================================================================

//================================================================================
// implements
//================================================================================

//================================================================================
// MAIN CODE
//================================================================================
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        state               <= ST_IDLE  ;
        bytes_rx_cnt        <=  16'd0   ;
        ip_version          <=  4'b0    ;
        ip_header_len       <=  4'b0    ;
        ip_tos              <=  8'b0    ;
        ip_total_len        <=  16'b0   ;
        ip_id               <=  16'b0   ;
        ip_flag             <=  3'b0    ;
        ip_fragment_offset  <=  13'b0   ;
        ip_ttl              <=  8'b0    ;
        ip_ul_protocol      <=  8'b0    ;
        ip_checksum         <=  16'b0   ;
        ip_src_addr         <=  32'b0   ;
        ip_dst_addr         <=  32'b0   ;

        s_axis_rrdy         <=  1'b0    ;
        s_ip_axis_rend      <=  1'b0    ;
        s_ip_axis_rd        <=  8'b0    ;
        s_ip_axis_rdv       <=  1'b0    ;
        ip_valid            <=  1'b0    ;
    end else begin
        case (state)
            ST_IDLE: begin
                bytes_rx_cnt        <=  16'd0   ;

                s_axis_rrdy         <=  1'b1    ;
                s_ip_axis_rend      <=  1'b0    ;
                s_ip_axis_rd        <=  8'b0    ;
                s_ip_axis_rdv       <=  1'b0    ;
                ip_valid            <=  1'b0    ;
                
                if (
                    eth_type == IP_ETH_TYPE &&      //  upstream received ip packet
                    s_axis_rdv == 1'b1
                ) begin
                    state   <=  ST_IP_HEADER                ;

                    ip_version      <=  s_axis_rd[7:4]      ;   // pre receive 1 bytes
                    ip_header_len   <=  s_axis_rd[3:0]      ;
                    bytes_rx_cnt    <= bytes_rx_cnt + 1'b1  ;
                end else begin
                    state   <=  ST_IDLE                     ;
                end
            end

            ST_IP_HEADER: begin
                bytes_rx_cnt <= bytes_rx_cnt + 1'b1 ;
                case (bytes_rx_cnt) 
                    16'd1: ip_tos               <=  s_axis_rd       ;
                    16'd2: ip_total_len[15:8]   <=  s_axis_rd       ;
                    16'd3: ip_total_len[07:0]   <=  s_axis_rd       ;
                    16'd4: ip_id[15:08]         <=  s_axis_rd       ;
                    16'd5: ip_id[07:00]         <=  s_axis_rd       ;

                    16'd6: begin
                        ip_flag                 <=  s_axis_rd[7:4]  ;
                        ip_fragment_offset[12:8]<=  s_axis_rd[4:0]  ;
                    end

                    16'd7: ip_fragment_offset[7:0]  <=  s_axis_rd   ;
                    16'd8: ip_ttl                   <=  s_axis_rd   ;
                    16'd9: ip_ul_protocol           <=  s_axis_rd   ;
                    16'd10: ip_checksum[15:08]      <=  s_axis_rd   ;
                    16'd11: ip_checksum[07:00]      <=  s_axis_rd   ;
                    16'd12: ip_src_addr[31:24]      <=  s_axis_rd   ;
                    16'd13: ip_src_addr[23:16]      <=  s_axis_rd   ;
                    16'd14: ip_src_addr[15:08]      <=  s_axis_rd   ;
                    16'd15: ip_src_addr[07:00]      <=  s_axis_rd   ;
                    16'd16: ip_dst_addr[31:24]      <=  s_axis_rd   ;
                    16'd17: ip_dst_addr[23:16]      <=  s_axis_rd   ;
                    16'd18: ip_dst_addr[15:08]      <=  s_axis_rd   ;
                    16'd19: ip_dst_addr[07:00]      <=  s_axis_rd   ;

                    default: begin  //  26.4.8 add: dest ip check
                        if (ip_dst_addr == board_ip) begin
                            state           <=  ST_IP_PAYLOAD   ;   // 1if received dst ip is board ip, receive payload
                            ip_valid        <=  1'b1            ;
                            s_ip_axis_rdv   <=  1'b1            ;
                            s_ip_axis_rd    <=  s_axis_rd       ;   //  pre-fill 1 byte
                        end else begin
                            state           <= ST_IP_END        ;   // or else, drop this packet
                            ip_valid        <=  1'b0            ;
                        end
                    end
                endcase
            end

            ST_IP_PAYLOAD: begin
                s_ip_axis_rd        <=  s_axis_rd   ;
                if (s_axis_rdv == 1'b0 ) begin
                    s_ip_axis_rd    <=  8'b0    ;
                    s_ip_axis_rdv   <=  1'b0    ;
                    s_ip_axis_rend  <=  1'b1    ;
                    state           <=  ST_IP_END   ;
                end
            end

            ST_IP_END: begin
                s_ip_axis_rend  <=  1'b0    ;
                state           <=  ST_IDLE ;
            end
        endcase
    end
end

endmodule
```

#### IP 封包模块
同样是两个握手接口, 一个接口负责接收来自上游模块 (UDP、TCP模块) 的数据, 一个接口用来将封装好的数据发送到下游模块 (以太网封包模块)。

```verilog collapse={28-164}
module ip_encap (
    input   wire            clk             ,   //  [I] [     ] Module clock
    input   wire            rst_n           ,   //  [I] [     ] Module reset signal, active-low
    
    // downstream: ethernet pack encapsulation
    input   wire            encap_busy      ,   //  [I] [     ] encapsulation module busy state input, we only send packet when this signal is 1'b0    
    output  reg     [07:00] s_axis_td       ,   //  [O] [07:00] axis send data output to encapsulation module
    output  reg             s_axis_tdv      ,   //  [O] [     ] axis send data valid output to encapsulation module
    output  wire            s_axis_tend     ,   //  [O] [     ] axis send tend output to encapsulation module
    input   wire            s_axis_trdy     ,   //  [I] [     ] axis send ready signal

    // upstream: tcp/udp/icmp tx output
    input   wire    [07:00] s_ip_axis_td    ,   //  [I] [07:00] IP data AXI-Stream input
    input   wire            s_ip_axis_tdv   ,   //  [I] [     ] IP data send valid, active-high
    input   wire            s_ip_axis_tend  ,   //  [I] [     ] IP data send end
    output  reg             s_ip_axis_trdy  ,   //  [O] [     ] IP data send ready

    // IP header
    input   wire    [15:00] data_length     ,   //  [I] [15:00] Data segment length in bytes
    input   wire    [07:00] ip_ttl          ,   //  [I] [07:00] Time to live.
    input   wire    [07:00] ip_ul_protocol  ,   //  [I] [07:00] Upper-layer protocol, (ICMP=8'd1, TCP=8'd6, UDP=8'd17)
    input   wire    [31:00] ip_src_ip       ,   //  [I] [31:00] Source ip address
    input   wire    [31:00] ip_dst_ip       ,   //  [I] [31:00] Destination ip address

    // States output
    output  reg             ip_tx_err_busy      //  [O] [     ] TX error when dowmstream encapsulation module is busy, at this time, upstream must stop transmission.
);

//================================================================================
// Local Parameter Declarations
//================================================================================
localparam  IP_VERSION          =   4'h4        ;   // ipv4
localparam  IP_HEADER_LENGTH    =   4'h5        ;   // header length 5, 20 bytes in total.
localparam  IP_TOS              =   8'h00       ;

// state defines
localparam  ST_IDLE             =   4'b0        ;
localparam  ST_CHECKSUM         =   4'd1        ;
localparam  ST_CHECKSUM_CHECK   =   4'd2        ;
localparam  ST_IP_TX_TRIG       =   4'd3        ;
localparam  ST_IP_PAYLOAD       =   4'd4        ;
localparam  ST_IP_END           =   4'd5        ;

//================================================================================
// Register Declarations
//================================================================================
reg     [03:00] state               ;
reg     [31:00] ip_header   [4:0]   ;   //  ip header: 20 bytes
reg     [04:00] ip_header_index     ;   //  for checksum and header transmission
reg     [31:00] checksum_buffer     ;
reg     [15:00] cnt                 ;   //  a counter

//================================================================================
// Wire Declarations
//================================================================================
wire    [15:00] total_length    ;   // total ip packet length, include header and data segment

//================================================================================
// Assign Declarations
//================================================================================
assign  total_length    =   ((IP_HEADER_LENGTH*4) + data_length)    ;
assign  s_axis_tend     =   s_ip_axis_tend                          ;

//================================================================================
// implements
//================================================================================

//================================================================================
// MAIN CODE
//================================================================================
always  @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        state           <=  ST_IDLE ;
        cnt             <=  16'd0   ;

        ip_header[0]    <=  32'b0   ;
        ip_header[1]    <=  32'b0   ;
        ip_header[2]    <=  32'b0   ;
        ip_header[3]    <=  32'b0   ;
        ip_header[4]    <=  32'b0   ;
        ip_header_index <=  5'd00   ;
        checksum_buffer <=  32'b0   ;

        s_axis_tdv      <=  1'b0    ;
        s_axis_td       <=  8'b0    ;
        s_ip_axis_trdy  <=  1'b0    ;

        ip_tx_err_busy  <=  1'b0    ;
    end else begin
        case(state)
            ST_IDLE: begin
                s_ip_axis_trdy  <=  1'b0    ;
                if (encap_busy == 1'b1) begin
                    ip_tx_err_busy  <=  1'b1    ;
                end else if (s_ip_axis_tdv == 1'b1) begin
                    ip_tx_err_busy  <=  1'b0    ;
                    // pre fill buffer, in order to calculate checksum.
                    ip_header[0]        <=  {IP_VERSION, IP_HEADER_LENGTH, IP_TOS, total_length};
                    ip_header[1][31:16] <=  ip_header[1][31:16] + 1'b1  ;   //  id, auto increment by 1
                    ip_header[1][15:13] <=  3'b010                      ;   //  No fragment
                    ip_header[1][12:00] <=  13'd00                      ;   //  Fragment offset
                    ip_header[2][31:24] <=  ip_ttl                      ;   //  TTL
                    ip_header[2][23:16] <=  ip_ul_protocol              ;   //  Upper-layer protocol, (ICMP=8'd1, TCP=8'd6, UDP=8'd17)
                    ip_header[2][15:00] <=  16'h0000                    ;   //  IP header checksum, temporarily is 0
                    ip_header[3]        <=  ip_src_ip                   ;   //  Source ip address
                    ip_header[4]        <=  ip_dst_ip                   ;   //  Destination ip address

                    state   <=  ST_CHECKSUM ;
                end
            end

            ST_CHECKSUM: begin
                checksum_buffer <=  ip_header[0][31:16] + ip_header[0][15:00] +
                                    ip_header[1][31:16] + ip_header[1][15:00] +
                                    ip_header[2][31:16] + ip_header[2][15:00] +
                                    ip_header[3][31:16] + ip_header[3][15:00] +
                                    ip_header[4][31:16] + ip_header[4][15:00] ;
                state   <=  ST_CHECKSUM_CHECK   ;
            end

            ST_CHECKSUM_CHECK: begin
                if (checksum_buffer[31:16] == 16'h0000) begin           // Accumulate until the high 16 bits are 0.
                    ip_header[2][15:00] <=  ~checksum_buffer[15:00] ;   //  The final result is bitwise negated.
                    state               <=  ST_IP_TX_TRIG           ;   //  Goto next state

                    s_axis_tdv          <=  1'b1                    ;   //  downstream: frame encapsulation tx valid, then wait trdy signal
                    // s_axis_td           <=  ip_header[0][31:24]     ;
                    // cnt                 <=  15'd1                   ;
                end else begin
                    checksum_buffer <=  checksum_buffer[31:16] + checksum_buffer[15:00];
                end
            end

            ST_IP_TX_TRIG: begin
                if (s_axis_trdy == 1'b1) begin
                    cnt         <=  cnt + 1'b1          ;
                    s_axis_td   <=  ip_header[cnt[15:2]][((3 - cnt[1:0])*8)+:8];
                    if (cnt == IP_HEADER_LENGTH*4 - 1) begin
                        cnt         <=  16'd0           ;
                        state       <=  ST_IP_PAYLOAD   ;
                        // s_axis_td   <=  s_ip_axis_td    ;
                    end else if (cnt == IP_HEADER_LENGTH*4 - 2) begin
                        s_ip_axis_trdy  <=  1'b1            ;
                    end
                end
            end

            ST_IP_PAYLOAD: begin
                s_axis_td           <=  s_ip_axis_td    ;
                if (s_ip_axis_tend == 1'b1) begin
                    s_axis_tdv      <=  1'b0            ;
                    s_axis_td           <=  8'b00       ;
                    s_ip_axis_trdy      <=  1'b0        ;
                    state           <=  ST_IP_END       ;
                end
            end

            ST_IP_END: begin
                state               <=  ST_IDLE             ;
            end
        endcase
    end
end

endmodule
```

#### IP 协议顶层
这个模块作为一个顶层例化了封包和解包两个子模块, 方便在其它上层模块中进行调用。

```verilog collapse={61-85,89-119}
module ip(
    input   wire            tx_clk                      ,   //  [I] [     ] Module tx clock
    input   wire            rx_clk                      ,   //  [I] [     ] Module rx clock
    input   wire            rst_n                       ,   //  [I] [     ] Module reset signal, active-low

    input   wire    [15:00] ip_rx_eth_type              ,   //  [I] [15:00] received ethertype
    input   wire    [31:00] board_ip                    ,   //  [I] [31:00] board ip address, for comparison whith received destination ip address

    // ip encap
    // downstream: ethernet pack encapsulation
    input   wire            encap_busy                  ,   //  [I] [     ] encapsulation module busy state input, we only send packet when this signal is 1'b0
    output  wire    [07:00] s_axis_td                   ,   //  [O] [07:00] axis send data output to encapsulation module
    output  wire            s_axis_tdv                  ,   //  [O] [     ] axis send data valid output to encapsulation module
    output  wire            s_axis_tend                 ,   //  [O] [     ] axis send tend output to encapsulation module
    input   wire            s_axis_trdy                 ,   //  [I] [     ] axis send ready signal

    // IP payload output, to downstream: tcp/udp/icmp
    output  wire            s_ip_axis_trdy              ,   //  [I] [     ] IP downstream rx ready
    input   wire    [07:00] s_ip_axis_td                ,   //  [O] [07:00] IP data AXI-Stream output
    input   wire            s_ip_axis_tdv               ,   //  [O] [     ] IP data output valid, active-high
    input   wire            s_ip_axis_tend              ,   //  [O] [     ] IP data output end

    input   wire    [15:00] ip_encap_data_length        ,   //  [I] [15:00] Data segment length in bytes
    input   wire    [07:00] ip_encap_ttl                ,   //  [I] [07:00] Time to live.
    input   wire    [07:00] ip_encap_ul_protocol        ,   //  [I] [07:00] Upper-layer protocol, (ICMP=8'd1, TCP=8'd6, UDP=8'd17)
    input   wire    [31:00] ip_encap_src_ip             ,   //  [I] [31:00] Source ip address
    input   wire    [31:00] ip_encap_dst_ip             ,   //  [I] [31:00] Destination ip address

    output  wire            ip_encap_tx_err_busy        ,   //  [O] [     ] TX error when dowmstream encapsulation module is busy, at this time, upstream must stop transmission.

    // ip decap
    // upstream: ethernet pack decapsulation
    input   wire            decap_busy                  ,   //  [I] [     ] decapsulation module busy state input
    input   wire    [07:00] s_axis_rd                   ,   //  [I] [07:00] axis receive data input from decapsulation module
    input   wire            s_axis_rdv                  ,   //  [I] [     ] axis receive data valid input from decapsulation module
    input   wire            s_axis_rend                 ,   //  [I] [     ] axis receive tend input from decapsulation module
    output  wire            s_axis_rrdy                 ,   //  [O] [     ] axis receive ready signal

    input   wire            s_ip_axis_rrdy              ,   //  [I] [     ] IP downstream rx ready
    output  wire    [07:00] s_ip_axis_rd                ,   //  [O] [07:00] IP data received output
    output  wire            s_ip_axis_rdv               ,   //  [O] [     ] IP data valid output, active-high
    output  wire            s_ip_axis_rend              ,   //  [O] [     ] IP data output end

    // output received ip header
    output  wire            ip_valid                    ,   //  [O] [     ] Active-high only received destination ip address is board-ip
    output  wire    [03:00] ip_decap_version            ,   //  [O] [03:00] IP version, 4'b4: ipv4, 4'b6: ipv6
    output  wire    [03:00] ip_decap_header_len         ,   //  [O] [03:00] IP header length, In units of 32 bits (4 bytes).
    output  wire    [07:00] ip_decap_tos                ,   //  [O] [07:00] IP type of service
    output  wire    [15:00] ip_decap_total_len          ,   //  [O] [15:00] IP total length (include payload)
    output  wire    [15:00] ip_decap_id                 ,   //  [O] [15:00] IP identification
    output  wire    [02:00] ip_decap_flag               ,   //  [O] [02:00] IP Flag, bit2: reserved, bit1: 1'b1 is allowing fragmentation, else disallowing. bit0: 1'b1 is more frame, 1'b0 is the last frame.
    output  wire    [12:00] ip_decap_fragment_offset    ,   //  [O] [12:00] IP fragment offset
    output  wire    [07:00] ip_decap_ttl                ,   //  [O] [07:00] IP time to live
    output  wire    [07:00] ip_decap_ul_protocol        ,   //  [O] [07:00] IP upper-layer protocol (ICMP = 8'd1, TCP=8'd6, UDp=8'd17)
    output  wire    [15:00] ip_decap_checksum           ,   //  [O] [15:00] IP checksum
    output  wire    [31:00] ip_decap_src_addr           ,   //  [O] [31:00] Source ip address
    output  wire    [31:00] ip_decap_dst_addr               //  [O] [31:00] Destination ip address
);

ip_encap ip_encap_inst (
    .clk                (   tx_clk                      ),  //  [I] [     ] Module clock
    .rst_n              (   rst_n                       ),  //  [I] [     ] Module reset signal, active-low
    
    // downstream: ethernet pack encapsulation
    .encap_busy         (   encap_busy                  ),  //  [I] [     ] encapsulation module busy state input, we only send packet when this signal is 1'b0
    .s_axis_td          (   s_axis_td                   ),  //  [O] [07:00] axis send data output to encapsulation module
    .s_axis_tdv         (   s_axis_tdv                  ),  //  [O] [     ] axis send data valid output to encapsulation module
    .s_axis_tend        (   s_axis_tend                 ),  //  [O] [     ] axis send tend output to encapsulation module
    .s_axis_trdy        (   s_axis_trdy                 ),  //  [I] [     ] axis send ready signal
    
    // upstream: tcp/udp/icmp tx output
    .s_ip_axis_td       (   s_ip_axis_td                ),  //  [I] [07:00] IP data AXI-Stream input
    .s_ip_axis_tdv      (   s_ip_axis_tdv               ),  //  [I] [     ] IP data receive valid, active-high
    .s_ip_axis_tend     (   s_ip_axis_tend              ),  //  [I] [     ] IP data receive end
    .s_ip_axis_trdy     (   s_ip_axis_trdy              ),  //  [O] [     ] IP data receive ready

    // IP header
    .data_length        (   ip_encap_data_length        ),  //  [I] [15:00] Data segment length in bytes
    .ip_ttl             (   ip_encap_ttl                ),  //  [I] [07:00] Time to live.
    .ip_ul_protocol     (   ip_encap_ul_protocol        ),  //  [I] [07:00] Upper-layer protocol, (ICMP=8'd1, TCP=8'd6, UDP=8'd17)
    .ip_src_ip          (   ip_encap_src_ip             ),  //  [I] [31:00] Source ip address
    .ip_dst_ip          (   ip_encap_dst_ip             ),  //  [I] [31:00] Destination ip address

    // States output
    .ip_tx_err_busy     (   ip_encap_tx_err_busy        )   //  [O] [     ] TX error when dowmstream encapsulation module is busy, at this time, upstream must stop transmission.
);

ip_decap ip_decap_inst (
    .clk                (   rx_clk                      ),  //  [I] [     ] Module clock
    .rst_n              (   rst_n                       ),  //  [I] [     ] Module reset signal, active-low
    .eth_type           (   ip_rx_eth_type              ),  //  [I] [15:00] received ethertype
    .board_ip           (   board_ip                    ),  //  [I] [31:00] board ip address, for comparison whith received destination ip address
    // upstream: ethernet pack decapsulation
    .decap_busy         (   decap_busy                  ),  //  [I] [     ] decapsulation module busy state input
    .s_axis_rd          (   s_axis_rd                   ),  //  [I] [07:00] axis receive data input from decapsulation module
    .s_axis_rdv         (   s_axis_rdv                  ),  //  [I] [     ] axis receive data valid input from decapsulation module
    .s_axis_rend        (   s_axis_rend                 ),  //  [I] [     ] axis receive tend input from decapsulation module
    .s_axis_rrdy        (   s_axis_rrdy                 ),  //  [O] [     ] axis receive ready signal

    // IP payload output, to downstream: tcp/udp/icmp
    .s_ip_axis_rrdy     (   s_ip_axis_rrdy              ),  //  [I] [     ] IP downstream rx ready
    .s_ip_axis_rd       (   s_ip_axis_rd                ),  //  [O] [07:00] IP data AXI-Stream output
    .s_ip_axis_rdv      (   s_ip_axis_rdv               ),  //  [O] [     ] IP data output valid, active-high
    .s_ip_axis_rend     (   s_ip_axis_rend              ),  //  [O] [     ] IP data output end

    // output received ip header
    .ip_valid           (   ip_valid                    ),  //  [O] [     ] Active-high only received destination ip address is board-ip
    .ip_version         (   ip_decap_version            ),  //  [O] [03:00] IP version, 4'b4: ipv4, 4'b6: ipv6
    .ip_header_len      (   ip_decap_header_len         ),  //  [O] [03:00] IP header length, In units of 32 bits (4 bytes).
    .ip_tos             (   ip_decap_tos                ),  //  [O] [07:00] IP type of service
    .ip_total_len       (   ip_decap_total_len          ),  //  [O] [15:00] IP total length (include payload)
    .ip_id              (   ip_decap_id                 ),  //  [O] [15:00] IP identification
    .ip_flag            (   ip_decap_flag               ),  //  [O] [02:00] IP Flag, bit2: reserved, bit1: 1'b1 is allowing fragmentation, else disallowing. bit0: 1'b1 is more frame, 1'b0 is the last frame.
    .ip_fragment_offset (   ip_decap_fragment_offset    ),  //  [O] [12:00] IP fragment offset
    .ip_ttl             (   ip_decap_ttl                ),  //  [O] [07:00] IP time to live
    .ip_ul_protocol     (   ip_decap_ul_protocol        ),  //  [O] [07:00] IP upper-layer protocol (ICMP = 8'd1, TCP=8'd6, UDp=8'd17)
    .ip_checksum        (   ip_decap_checksum           ),  //  [O] [15:00] IP checksum
    .ip_src_addr        (   ip_decap_src_addr           ),  //  [O] [31:00] Source ip address
    .ip_dst_addr        (   ip_decap_dst_addr           )   //  [O] [31:00] Destination ip address
);

endmodule
```
