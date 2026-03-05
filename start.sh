#!/bin/bash

# Start PM2 with production config
pm2 start ecosystem.config.js

echo "EchoSpark started in production mode."
echo "Use 'pm2 status' to check service status."
echo "Use 'pm2 logs EchoSpark' to view logs."
