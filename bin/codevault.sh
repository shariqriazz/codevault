#!/bin/sh
NODE_NO_WARNINGS=1 exec node "$(dirname "$0")/../dist/cli.js" "$@"