#!/bin/bash
# 本地端互動式 Chat - 無限迴圈直到 exit

echo "=== MiniOC Chat (輸入 'exit' 離開) ==="
echo ""

while true; do
    printf "You: "
    read MESSAGE
    
    if [[ "$MESSAGE" == "exit" ]] || [[ "$MESSAGE" == "quit" ]]; then
        echo "再見！"
        exit 0
    fi
    
    if [[ -z "$MESSAGE" ]]; then
        continue
    fi
    
    echo ""
    RESPONSE=$(docker exec -i minioc node src/chat.js "$MESSAGE" 2>&1)
    echo "$RESPONSE" | grep -v "Processing message\|Using OpenCode\|OpenCode -\|opencode stderr\|AI response" | tail -1
    echo ""
done
