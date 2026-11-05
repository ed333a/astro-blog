// 因为无法将 Xilinx 原语打包到 Modelsim 工程中
// 在这里手动实现一个 IOBUF 原语
module IOBUF # (
    parameter DRIVE         = 12        ,
    parameter IBUF_LOW_PWR  = "TRUE"    ,
    parameter IOSTANDARD    = "DEFAULT" ,
    parameter SLEW          = "SLOW"
)(
    inout   wire    IO  ,
    output  wire    O   ,
    input   wire    I   ,
    input   wire    T       // 1'b0: Output, 1'b1: input
);

assign O  = T  ? IO : I     ;
assign IO = ~T ? I  : 1'bz  ;

endmodule