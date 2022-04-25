
all: run


# Default target to run
#.DEFAULT_GOAL := run

.PHONY: run
run:
	hugo server -D 
