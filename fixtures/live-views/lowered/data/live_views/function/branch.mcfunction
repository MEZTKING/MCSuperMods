scoreboard objectives add lv_branch dummy
scoreboard objectives add lv_success dummy
scoreboard players set @s lv_branch 5
execute if score @s lv_branch matches 5 run tag @s add lv_five
execute unless score @s lv_branch matches 5 run tag @s add lv_not_five
execute if block ~1 ~ ~ minecraft:air run tag @s add lv_air_beside
execute if predicate live_views:always run tag @s add lv_predicate
execute store result score @s lv_branch run function live_views:four
execute store success score @s lv_success if score @s lv_branch matches 4
