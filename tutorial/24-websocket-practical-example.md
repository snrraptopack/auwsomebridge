# Tutorial 24: Practical Example - Real-Time Chat

Let's build a complete real-time chat application with rooms, user presence, and typing indicators.

## The Scenario

We're building a chat app where:
- Users must be authenticated to join
- Multiple chat rooms exist
- Users can see who's online in their room
- Typing indicators show when someone is typing
- Messages are broadcast to all users in the room
- Users can leave rooms gracefully

## Step 1: Helper Functions

```typescript
// helpers/chat.ts

interface User {
  id: string;
  username: string;
  avatar?: string;
}

interface ChatRoom {
  id: string;
  name: string;
  members: Set<string>;  // User IDs
}

// In-memory storage (use database in production)
const rooms = new Map<string, ChatRoom>();
const activeConnections = new Map<string, {
  userId: string;
  username: string;
  roomId: string;
  connection: any;
}>();

// Get or create room
export function getRoom(roomId: string): ChatRoom {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: roomId,
      members: new Set()
    });
  }
  return rooms.get(roomId)!;
}

// Add user to room
export function joinRoom(roomId: string, userId: string): void {
  const room = getRoom(roomId);
  room.members.add(userId);
}

// Remove user from room
export function leaveRoom(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (room) {
    room.members.delete(userId);
  }
}

// Get room members
export function getRoomMembers(roomId: string): string[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.members) : [];
}

// Register connection
export function registerConnection(
  connectionId: string,
  userId: string,
  username: string,
  roomId: string,
  connection: any
): void {
  activeConnections.set(connectionId, {
    userId,
    username,
    roomId,
    connection
  });
}

// Unregister connection
export function unregisterConnection(connectionId: string): void {
  activeConnections.delete(connectionId);
}

// Broadcast to room
export function broadcastToRoom(
  roomId: string,
  message: any,
  excludeConnectionId?: string
): void {
  for (const [connId, conn] of activeConnections.entries()) {
    if (conn.roomId === roomId && connId !== excludeConnectionId) {
      try {
        conn.connection.send(message);
      } catch (error) {
        console.error(`Failed to send to ${connId}:`, error);
      }
    }
  }
}

// Get online users in room
export function getOnlineUsers(roomId: string): Array<{ userId: string; username: string }> {
  const online: Array<{ userId: string; username: string }> = [];
  
  for (const conn of activeConnections.values()) {
    if (conn.roomId === roomId) {
      online.push({
        userId: conn.userId,
        username: conn.username
      });
    }
  }
  
  return online;
}
```

## Step 2: Authentication Hook

```typescript
// hooks/auth.ts
import { defineHook } from '../server/core/bridge';
import jwt from 'jsonwebtoken';

export const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    const token = ctx.req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return {
        next: false,
        status: 401,
        error: 'Authentication required'
      };
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
        username: string;
      };
      
      ctx.context.userId = decoded.userId;
      ctx.context.username = decoded.username;
      
      return { next: true };
    } catch (error) {
      return {
        next: false,
        status: 401,
        error: 'Invalid or expired token'
      };
    }
  }
});
```

## Step 3: Connection Management Hook

```typescript
// hooks/connectionManager.ts
import { defineHook } from '../server/core/bridge';
import {
  registerConnection,
  unregisterConnection,
  joinRoom,
  leaveRoom,
  broadcastToRoom,
  getOnlineUsers
} from '../helpers/chat';

export const connectionManagerHook = defineHook({
  name: 'connectionManager',
  before: (ctx) => {
    ctx.context.connectionId = crypto.randomUUID();
    ctx.context.joinedAt = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    const { connectionId, roomId, userId, username } = ctx.context;
    
    // Remove from room
    if (roomId) {
      leaveRoom(roomId, userId);
      
      // Notify others
      broadcastToRoom(roomId, {
        type: 'user_left',
        userId,
        username,
        timestamp: Date.now(),
        onlineUsers: getOnlineUsers(roomId)
      });
    }
    
    // Unregister connection
    unregisterConnection(connectionId);
    
    const duration = Date.now() - ctx.joinedAt;
    console.log(`💬 ${username} disconnected after ${duration}ms`);
    
    return { next: true };
  }
});
```

## Step 4: The Chat Route

```typescript
// routes/chat.ts
import { defineRoute } from '../server/core/bridge';
import { z } from 'zod';
import { authHook } from '../hooks/auth';
import { connectionManagerHook } from '../hooks/connectionManager';
import {
  joinRoom,
  registerConnection,
  broadcastToRoom,
  getOnlineUsers
} from '../helpers/chat';

export const chatRoutes = {
  chatRoom: defineRoute({
    kind: 'ws',
    
    // Validate handshake params and messages
    input: z.discriminatedUnion('type', [
      // Message types
      z.object({
        type: z.literal('message'),
        text: z.string().min(1).max(1000)
      }),
      z.object({
        type: z.literal('typing'),
        isTyping: z.boolean()
      })
    ]),
    
    // Apply hooks
    hooks: [authHook, connectionManagerHook],
    
    handler: {
      onOpen: async (connection) => {
        const { userId, username, connectionId } = connection.context;
        
        // Get room from query params
        const roomId = new URL(
          connection.headers.host + connection.headers.url
        ).searchParams.get('roomId') || 'general';
        
        connection.context.roomId = roomId;
        
        // Join room
        joinRoom(roomId, userId);
        
        // Register connection
        registerConnection(connectionId, userId, username, roomId, connection);
        
        // Get online users
        const onlineUsers = getOnlineUsers(roomId);
        
        // Send welcome message to user
        connection.send({
          type: 'welcome',
          roomId,
          message: `Welcome to ${roomId}, ${username}!`,
          onlineUsers
        });
        
        // Notify others
        broadcastToRoom(roomId, {
          type: 'user_joined',
          userId,
          username,
          timestamp: Date.now(),
          onlineUsers
        }, connectionId);
        
        console.log(`💬 ${username} joined room ${roomId}`);
      },
      
      onMessage: async (message, connection) => {
        const { userId, username, roomId, connectionId } = connection.context;
        
        if (message.type === 'message') {
          // Broadcast chat message
          const chatMessage = {
            type: 'message',
            messageId: crypto.randomUUID(),
            userId,
            username,
            text: message.text,
            timestamp: Date.now()
          };
          
          // Send to everyone including sender
          connection.send(chatMessage);
          broadcastToRoom(roomId, chatMessage, connectionId);
          
          console.log(`💬 [${roomId}] ${username}: ${message.text}`);
        }
        else if (message.type === 'typing') {
          // Broadcast typing indicator (not to sender)
          broadcastToRoom(roomId, {
            type: 'typing',
            userId,
            username,
            isTyping: message.isTyping
          }, connectionId);
        }
      },
      
      onClose: async (connection, code, reason) => {
        console.log(`💬 ${connection.context.username} closed connection: ${reason}`);
      },
      
      onError: async (connection, error) => {
        console.error(`💬 Error for ${connection.context.username}:`, error);
        
        connection.send({
          type: 'error',
          message: 'An error occurred'
        });
      }
    }
  })
};
```

## Step 5: Client Side - HTML/JS

```html
<!DOCTYPE html>
<html>
<head>
  <title>Real-Time Chat</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    #messages {
      height: 400px;
      overflow-y: auto;
      border: 1px solid #ccc;
      padding: 10px;
      margin-bottom: 10px;
    }
    .message {
      margin: 10px 0;
      padding: 8px;
      border-radius: 4px;
    }
    .message.own {
      background: #e3f2fd;
      text-align: right;
    }
    .message.other {
      background: #f5f5f5;
    }
    .system {
      color: #666;
      font-style: italic;
      text-align: center;
    }
    .typing {
      color: #999;
      font-size: 0.9em;
    }
    #online-users {
      background: #f9f9f9;
      padding: 10px;
      margin-bottom: 10px;
      border-radius: 4px;
    }
    #input-area {
      display: flex;
      gap: 10px;
    }
    #message-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    button {
      padding: 10px 20px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #1976D2;
    }
  </style>
</head>
<body>
  <h1>Real-Time Chat</h1>
  
  <div id="online-users">
    <strong>Online:</strong> <span id="user-list"></span>
  </div>
  
  <div id="messages"></div>
  <div id="typing-indicator" class="typing"></div>
  
  <div id="input-area">
    <input id="message-input" type="text" placeholder="Type a message..." />
    <button id="send-btn">Send</button>
  </div>
  
  <script>
    // Get auth token and room from URL
    const token = localStorage.getItem('authToken') || 'demo-token';
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId') || 'general';
    const username = localStorage.getItem('username') || 'User' + Math.floor(Math.random() * 1000);
    
    // Connect to WebSocket
    const ws = new WebSocket(`ws://localhost:3000/api/chatRoom?roomId=${roomId}`);
    
    // Set auth header (note: WebSocket doesn't support custom headers in browser)
    // In production, pass token in query string or use a proxy
    
    const messagesDiv = document.getElementById('messages');
    const typingDiv = document.getElementById('typing-indicator');
    const userListSpan = document.getElementById('user-list');
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    
    let typingTimeout;
    let currentUserId;
    
    // Connection opened
    ws.onopen = () => {
      console.log('Connected to chat');
    };
    
    // Receive messages
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'welcome':
          currentUserId = data.userId;
          addSystemMessage(data.message);
          updateOnlineUsers(data.onlineUsers);
          break;
          
        case 'user_joined':
          addSystemMessage(`${data.username} joined the chat`);
          updateOnlineUsers(data.onlineUsers);
          break;
          
        case 'user_left':
          addSystemMessage(`${data.username} left the chat`);
          updateOnlineUsers(data.onlineUsers);
          break;
          
        case 'message':
          addMessage(data);
          break;
          
        case 'typing':
          showTyping(data.username, data.isTyping);
          break;
          
        case 'error':
          addSystemMessage(`Error: ${data.message}`);
          break;
      }
    };
    
    // Send message
    function sendMessage() {
      const text = input.value.trim();
      if (text && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'message',
          text
        }));
        input.value = '';
        
        // Stop typing indicator
        ws.send(JSON.stringify({
          type: 'typing',
          isTyping: false
        }));
      }
    }
    
    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    };
    
    // Typing indicator
    input.oninput = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'typing',
          isTyping: true
        }));
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'typing',
            isTyping: false
          }));
        }, 1000);
      }
    };
    
    // Display functions
    function addMessage(msg) {
      const div = document.createElement('div');
      div.className = `message ${msg.userId === currentUserId ? 'own' : 'other'}`;
      div.innerHTML = `
        <strong>${msg.username}</strong>
        <div>${msg.text}</div>
        <small>${new Date(msg.timestamp).toLocaleTimeString()}</small>
      `;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function addSystemMessage(text) {
      const div = document.createElement('div');
      div.className = 'system';
      div.textContent = text;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function updateOnlineUsers(users) {
      userListSpan.textContent = users.map(u => u.username).join(', ');
    }
    
    const typingUsers = new Set();
    function showTyping(username, isTyping) {
      if (isTyping) {
        typingUsers.add(username);
      } else {
        typingUsers.delete(username);
      }
      
      if (typingUsers.size > 0) {
        const names = Array.from(typingUsers).join(', ');
        typingDiv.textContent = `${names} ${typingUsers.size === 1 ? 'is' : 'are'} typing...`;
      } else {
        typingDiv.textContent = '';
      }
    }
    
    // Connection closed
    ws.onclose = () => {
      addSystemMessage('Disconnected from chat');
    };
    
    // Error
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      addSystemMessage('Connection error');
    };
  </script>
</body>
</html>
```

## Step 6: Server Setup

```typescript
// server.ts
import express from 'express';
import { setupBridge } from './server/core/bridge';
import { chatRoutes } from './routes/chat';
import { createExpressWebSocketServer } from './server/core/express';

const app = express();
const server = app.listen(3000);

// Setup bridge
const { middleware } = setupBridge(chatRoutes, {
  prefix: '/api',
  logRequests: true
});

// HTTP routes
app.use('/api/:route', middleware);

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// WebSocket server
const wss = createExpressWebSocketServer(
  new Map(Object.entries(chatRoutes)),
  { prefix: '/api' }
);

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

console.log('🚀 Chat server running on http://localhost:3000');
```

## How It All Works Together

1. **User opens chat page** → `http://localhost:3000?roomId=general`
2. **Client connects via WebSocket** → `/api/chatRoom?roomId=general`
3. **authHook runs** → Validates JWT token, extracts userId/username
4. **connectionManagerHook runs** → Sets up connection tracking
5. **onOpen fires** → User joins room, others notified
6. **Messages flow** → Broadcast to all users in room
7. **Typing indicators** → Show who's typing in real-time
8. **User disconnects** → cleanup hook notifies others, removes from room

## Key Features Demonstrated

- ✅ Authentication with JWT
- ✅ Multiple chat rooms
- ✅ User presence (online/offline)
- ✅ Real-time message broadcasting
- ✅ Typing indicators
- ✅ Graceful connection cleanup
- ✅ Error handling
- ✅ Message validation

## What's Next?

You've completed the WebSocket tutorials! You now know how to build real-time applications with this framework.

---

**Congratulations! You've completed all the tutorials!**
