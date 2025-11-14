# Tutorial 21: Your First WebSocket Route

Let's create a simple WebSocket route that echoes messages back to the client.

## Basic WebSocket Route

Here's the simplest WebSocket route:

```typescript
import { defineRoute } from './server/core/bridge';

const routes = {
  echo: defineRoute({
    kind: 'ws',
    handler: {
      onMessage: async (message, connection) => {
        // Echo the message back
        connection.send({ echo: message });
      }
    }
  })
};
```

That's it! This route receives messages and sends them back.

## Understanding the Handler

WebSocket handlers are **objects** with lifecycle methods:

```typescript
handler: {
  onOpen: async (connection) => {
    // Called when connection opens
  },
  onMessage: async (message, connection) => {
    // Called when message received (REQUIRED)
  },
  onClose: async (connection, code, reason) => {
    // Called when connection closes
  },
  onError: async (connection, error) => {
    // Called on error
  }
}
```

Only `onMessage` is required.

## The Connection Object

The `connection` object lets you interact with the client:

```typescript
connection.send(data)           // Send message to client
connection.close(code, reason)  // Close connection
connection.id                   // Unique connection ID
connection.ip                   // Client IP address
connection.headers              // Request headers
connection.context              // Shared context (from hooks)
```

## Client Side: Using WebSocket

On the client, use the native `WebSocket` API:

```typescript
// Connect to WebSocket endpoint
const ws = new WebSocket('ws://localhost:3000/api/echo');

// Connection opened
ws.onopen = () => {
  console.log('Connected!');
  
  // Send a message
  ws.send(JSON.stringify({ text: 'Hello!' }));
};

// Receive messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Connection closed
ws.onclose = (event) => {
  console.log('Disconnected:', event.code, event.reason);
};

// Error occurred
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

## Client Side: Using Framework Helper

The framework provides a helper for easier usage:

```typescript
const { $ws } = setupBridge(routes, { baseUrl: '/api' });

// Connect and handle messages
const connection = $ws.echo({}, {
  onOpen: () => {
    console.log('Connected!');
    connection.send({ text: 'Hello!' });
  },
  onMessage: (data) => {
    console.log('Received:', data);
  },
  onClose: (code, reason) => {
    console.log('Disconnected:', code, reason);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Send messages
connection.send({ text: 'Another message' });

// Close connection
connection.close();
```

## Complete Example: Chat Echo

**Server:**
```typescript
import { defineRoute, setupBridge } from './server/core/bridge';

const routes = {
  chat: defineRoute({
    kind: 'ws',
    handler: {
      onOpen: async (connection) => {
        console.log(`Client ${connection.id} connected`);
        
        // Send welcome message
        connection.send({
          type: 'system',
          message: 'Welcome to the chat!'
        });
      },
      
      onMessage: async (message, connection) => {
        console.log(`Received from ${connection.id}:`, message);
        
        // Echo back with timestamp
        connection.send({
          type: 'echo',
          message: message,
          timestamp: new Date().toISOString()
        });
      },
      
      onClose: async (connection, code, reason) => {
        console.log(`Client ${connection.id} disconnected: ${reason}`);
      },
      
      onError: async (connection, error) => {
        console.error(`Error for ${connection.id}:`, error);
      }
    }
  })
};

const { middleware } = setupBridge(routes, {
  prefix: '/api'
});

// Express
import express from 'express';
const app = express();
const server = app.listen(3000);

// For WebSocket support in Express, you need to handle upgrade
import { createExpressWebSocketServer } from './server/core/express';
const wss = createExpressWebSocketServer(routes, { prefix: '/api' });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Hono
import { Hono } from 'hono';
const app = new Hono();
app.use('/api/:route', middleware);

// Bun (WebSocket support built-in)
Bun.serve({
  port: 3000,
  fetch: middleware,
  websocket: {
    // Handled by middleware
  }
});
```

**Client:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Chat</title>
</head>
<body>
  <h1>WebSocket Echo Chat</h1>
  
  <div id="messages"></div>
  <input id="input" type="text" placeholder="Type a message...">
  <button id="send">Send</button>
  
  <script>
    const ws = new WebSocket('ws://localhost:3000/api/chat');
    const messagesDiv = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    
    // Connection opened
    ws.onopen = () => {
      addMessage('Connected!', 'system');
    };
    
    // Receive messages
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      addMessage(data.message, data.type);
    };
    
    // Send message
    function sendMessage() {
      const text = input.value.trim();
      if (text && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text }));
        input.value = '';
      }
    }
    
    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => {
      if (e.key === 'Enter') sendMessage();
    };
    
    // Display message
    function addMessage(msg, type) {
      const div = document.createElement('div');
      div.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg);
      div.style.color = type === 'system' ? 'blue' : 'black';
      messagesDiv.appendChild(div);
    }
    
    // Connection closed
    ws.onclose = (event) => {
      addMessage(`Disconnected: ${event.reason || 'Unknown'}`, 'system');
    };
    
    // Error
    ws.onerror = (error) => {
      addMessage('Connection error', 'system');
    };
  </script>
</body>
</html>
```

## Sending Different Message Types

You can send any JSON-serializable data:

```typescript
handler: {
  onMessage: async (message, connection) => {
    // Send object
    connection.send({ type: 'notification', text: 'Hello!' });
    
    // Send array
    connection.send([1, 2, 3, 4, 5]);
    
    // Send string (will be JSON stringified)
    connection.send('Simple text');
    
    // Send number
    connection.send(42);
  }
}
```

## Connection States

WebSocket connections have states:

```typescript
// Client side
ws.readyState === WebSocket.CONNECTING  // 0 - Connecting
ws.readyState === WebSocket.OPEN        // 1 - Open
ws.readyState === WebSocket.CLOSING     // 2 - Closing
ws.readyState === WebSocket.CLOSED      // 3 - Closed

// Only send when open
if (ws.readyState === WebSocket.OPEN) {
  ws.send(JSON.stringify({ message: 'Hello' }));
}
```

## Closing Connections

Either side can close the connection:

```typescript
// Server closes
handler: {
  onMessage: async (message, connection) => {
    if (message.command === 'quit') {
      connection.close(1000, 'User requested disconnect');
    }
  }
}

// Client closes
ws.close(1000, 'User logged out');
```

Common close codes:
- `1000` - Normal closure
- `1001` - Going away (page closed)
- `1008` - Policy violation
- `1011` - Server error

## Key Points

1. **Use `kind: 'ws'`** to mark route as WebSocket
2. **Handler is an object** with lifecycle methods
3. **`onMessage` is required** - handles incoming messages
4. **Use `connection.send()`** to send messages
5. **Both sides can send anytime** - true bidirectional
6. **Client uses `WebSocket`** or `$ws.route()`
7. **Connection stays open** until closed by either side

## What's Next?

Now let's learn how to validate WebSocket messages!

---

**Next:** [22-websocket-input-validation.md](./22-websocket-input-validation.md)
