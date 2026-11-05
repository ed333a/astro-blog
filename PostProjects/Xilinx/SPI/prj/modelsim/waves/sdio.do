onerror {resume}
quietly WaveActivateNextPane {} 0
add wave -noupdate /sdio_tb/dut/clk
add wave -noupdate /sdio_tb/dut/rst_n
add wave -noupdate /sdio_tb/dut/rh_wl
add wave -noupdate /sdio_tb/dut/sdio_start_op
add wave -noupdate /sdio_tb/dut/register_addr
add wave -noupdate /sdio_tb/dut/dat_tx
add wave -noupdate /sdio_tb/dut/dat_rx
add wave -noupdate /sdio_tb/dut/spi_sclk
add wave -noupdate /sdio_tb/dut/spi_cs_n
add wave -noupdate /sdio_tb/dut/sdio
add wave -noupdate /sdio_tb/dut/spi_mosi
add wave -noupdate /sdio_tb/dut/spi_miso
add wave -noupdate /sdio_tb/dut/dat_rx_t
add wave -noupdate /sdio_tb/dut/data_bit_cnt
add wave -noupdate /sdio_tb/dut/sdio_dir
add wave -noupdate /sdio_tb/dut/spi_end
add wave -noupdate -expand -group IOBUF /sdio_tb/dut/spi_iobuf/O
add wave -noupdate -expand -group IOBUF /sdio_tb/dut/spi_iobuf/IO
add wave -noupdate -expand -group IOBUF /sdio_tb/dut/spi_iobuf/I
add wave -noupdate -expand -group IOBUF /sdio_tb/dut/spi_iobuf/T
TreeUpdate [SetDefaultTree]
WaveRestoreCursors {{Cursor 1} {901362 ps} 0}
quietly wave cursor active 1
configure wave -namecolwidth 150
configure wave -valuecolwidth 100
configure wave -justifyvalue left
configure wave -signalnamewidth 1
configure wave -snapdistance 10
configure wave -datasetprefix 0
configure wave -rowmargin 4
configure wave -childrowmargin 2
configure wave -gridoffset 0
configure wave -gridperiod 1
configure wave -griddelta 40
configure wave -timeline 0
configure wave -timelineunits ps
update
WaveRestoreZoom {0 ps} {11678088 ps}
