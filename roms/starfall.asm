; ============================================================
;  STARFALL - dodge the falling stars (SUPER-CHIP, 128x64)
;  Shows off hi-res mode, hardware scrolling (SCD, SCR, SCL)
;  and the big 8x10 font.
;  Controls: 4 = left, 6 = right   (keyboard Q / E or arrows)
;  (c) Jimmy Kurc - MIT License
; ============================================================
;  V0-V5 scratch   V7 score   V8 frame counter   VA,VB ship x,y

  HIGH

title:
  CLS
  LD V3, 40
  LD V5, 22
  LD V4, str_title - strings
  CALL draw_text
  LD V3, 49
  LD V5, 34
  LD V4, str_keys - strings
  CALL draw_text
  LD V0, K

start:
  CLS
  LD VA, 60
  LD VB, 56
  LD V7, 0
  LD V8, 0
  LD I, ship
  DRW VA, VB, 6

loop:
  CALL wait_frame
  LD I, ship
  DRW VA, VB, 6         ; lift the ship off the screen
  SCD 1                 ; the whole sky moves down one pixel

  RND V0, 3             ; new star on 1 frame out of 4
  SE V0, 0
  JP extra_star
  CALL new_star
extra_star:
  LD V0, V7             ; after 10 points: twice as many
  LD V1, 10
  SUB V0, V1
  SE VF, 1
  JP steer
  RND V0, 3
  SE V0, 0
  JP steer
  CALL new_star

steer:
  LD V0, 4
  SKNP V0
  CALL left
  LD V0, 6
  SKNP V0
  CALL right

  LD I, ship
  DRW VA, VB, 6         ; put it back - collision means a hit
  SE VF, 0
  JP crash

  ADD V8, 1             ; one point every 30 frames
  SE V8, 30
  JP loop
  LD V8, 0
  ADD V7, 1
  JP loop

new_star:
  RND V1, 127
  LD V2, 0
  LD I, star
  DRW V1, V2, 2
  RET

left:
  SNE VA, 0
  RET
  ADD VA, #FE
  RET

right:
  SNE VA, 120
  RET
  ADD VA, 2
  RET

crash:
  LD V0, 30
  LD ST, V0
  SCR                   ; shake the screen
  CALL wait_frame
  SCL
  CALL wait_frame
  SCL
  CALL wait_frame
  SCR
  CALL wait_frame
  LD V0, 45
  LD DT, V0
crash_wait:
  LD V0, DT
  SE V0, 0
  JP crash_wait

  CLS
  LD V3, 49
  LD V5, 14
  LD V4, str_score - strings
  CALL draw_text
  LD I, bcd
  LD B, V7
  LD V2, [I]
  LD V3, 49
  LD V4, 26
  LD HF, V0             ; big 8x10 digits
  DRW V3, V4, 10
  ADD V3, 11
  LD HF, V1
  DRW V3, V4, 10
  ADD V3, 11
  LD HF, V2
  DRW V3, V4, 10
  LD V0, 60
  LD DT, V0
score_wait:
  LD V0, DT
  SE V0, 0
  JP score_wait
  LD V0, K
  JP start

wait_frame:
  LD V0, DT
  SE V0, 0
  JP wait_frame
  LD V0, 1
  LD DT, V0
  RET

draw_text:
  LD I, strings
  ADD I, V4
  LD V0, [I]
  SNE V0, #FF
  RET
  LD I, glyphs
  ADD I, V0
  DRW V3, V5, 5
  ADD V3, 6
  ADD V4, 1
  JP draw_text

; ============================================================
bcd:   DB 0, 0, 0
star:  DB 0b11000000
       DB 0b11000000
ship:  DB 0b00011000
       DB 0b00011000
       DB 0b00111100
       DB 0b01111110
       DB 0b11111111
       DB 0b00100100

_ = 0
S = 5
T = 10
A = 15
RR = 20
FF = 25
L = 30
C = 35
O = 40
E = 45
FOUR = 50
SIX = 55
LT = 60
GT = 65

strings:
str_title: DB S, T, A, RR, FF, A, L, L, #FF
str_keys:  DB FOUR, LT, _, GT, SIX, #FF
str_score: DB S, C, O, RR, E, #FF

glyphs:
  DB #00, #00, #00, #00, #00   ; space
  DB #F0, #80, #F0, #10, #F0   ; S
  DB #F8, #20, #20, #20, #20   ; T
  DB #60, #90, #F0, #90, #90   ; A
  DB #E0, #90, #E0, #A0, #90   ; R
  DB #F0, #80, #E0, #80, #80   ; F
  DB #80, #80, #80, #80, #F0   ; L
  DB #F0, #80, #80, #80, #F0   ; C
  DB #F0, #90, #90, #90, #F0   ; O
  DB #F0, #80, #F0, #80, #F0   ; E
  DB #90, #90, #F0, #10, #10   ; 4
  DB #F0, #80, #F0, #90, #F0   ; 6
  DB #20, #40, #80, #40, #20   ; <
  DB #80, #40, #20, #40, #80   ; >
