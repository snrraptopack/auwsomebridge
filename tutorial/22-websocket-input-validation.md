# Tutorial 22: WebSocket Input Validation

WebSocket routes can validate both handshake parameters and incoming messages. Let's learn how to keep your WebSocket routes secure and type-safe.

## Two Types of Input

WebSocket routes have two types of input:

1. **Handshake input** - Query parameters when connection opens
2. **Message input** - Data sent in each message

The `input` schema validates **both**!

## Validating Handshake Parameters

Query parameters are validated when the connection opens:

```typescript
import { defineRoute } from './server/core/bridge';
import { z } from 'zod';

const routes = {
  chat: defineRoute({
    kind: 'ws',
    input: z.object({
      roomId: z.string().min(1),
      username: z.string().min(3).max(20)
    }),
    handler: {
      onOpen: async (connection) => {
        // Handshake params are NOT available here
        // They were only used for validation
        console.log('User connected');
      },
      onMessage: async (message, connection) => {
        // Messages are validated against the same schema
        console.log('Received:', message);
      }
    }
  })
};

// Client - pass params in URL
const ws = new WebSocket('ws://localhost:3000/api/chat?roomId=room1&username=john');
```

If validation fails, the connection is rejected before it opens.

## Validating Messages

The same schema validates incoming messages:

```typescript
const routes = {
  chat: defineRoute({
    kind: 'ws',
    input: z.object({
      type: z.enum(['message', 'typing', 'leave']),
      text: z.string().optional(),
      timestamp: z.number()
    }),
    handler: {
      onMessage: async (message, connection) => {
        // message is validated and typed!
        if (message.type === 'message') {
          console.log('Chat message:', message.text);
        } else if (message.type === 'typing') {
          console.log('User is typing...');
        }
      }
    }
  })
};

// Client - send validated messages
ws.send(JSON.stringify({
  type: 'message',
  text: 'Hello!',
  timestamp: Date.now()
}));
```

## Validation Errors

If a message fails validation, an error is sent back:

```typescript
// Client sends invalid message
ws.send(JSON.stringify({
  type: 'invalid',  // Not in enum
  timestamp: 'not-a-number'  // Wrong type
}));

// Client receives error
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'error' && data.code === 'VALIDATION_ERROR') {
    console.error('Validation failed:', data.details);
  }
};
```

The connection stays open - only the invalid message is rejected.

## Separate Schemas for Handshake and Messages

If you need different validation for handshake vs messages, use a union:

```typescript
const routes = {
  chat: defineRoute({
    kind: 'ws',
    // This validates BOTH handshake params AND messages
    input: z.union([
      // Handshake params (query string)
      z.object({
        roomId: z.string(),
        username: z.string()
      }),
      // Message types
      z.object({
        type: z.literal('message'),
        text: z.string()
      }),
      z.object({
        type: z.literal('typing')
      })
    ]),
    handler: {
      onMessage: async (message, connection) => {
        // TypeScript knows the possible types
        if ('type' in message) {
          // It's a message
          if (message.type === 'message') {
            console.log(message.text);
          }
        }
      }
    }
  })
};
```

## Example: Typed Chat Messages

```typescript
const routes = {
  chat: defineRoute({
    kind: 'ws',
    input: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('join'),
        username: z.string().min(3).max(20)
      }),
      z.object({
        type: z.literal('message'),
        text: z.string().min(1).max(500)
      }),
      z.object({
        type: z.literal('typing'),
        isTyping: z.boolean()
      }),
      z.object({
        type: z.literal('leave')
      })
    ]),
    handler: {
      onMessage: async (message, connection) => {
        // TypeScript knows all possible message types
        switch (message.type) {
          case 'join':
            console.log(`${message.username} joined`);
            connection.send({
              type: 'system',
              message: `${message.username} joined the chat`
            });
            break;
            
          case 'message':
            console.log(`Message: ${message.text}`);
            connection.send({
              type: 'message',
              text: message.text,
              timestamp: Date.now()
            });
            break;
            
          case 'typing':
            console.log(`Typing: ${message.isTyping}`);
            break;
            
          case 'leave':
            console.log('User left');
            connection.close(1000, 'User left');
            break;
        }
      }
    }
  })
};

// Client
const ws = new WebSocket('ws://localhost:3000/api/chat');

ws.onopen = () => {
  // Join chat
  ws.send(JSON.stringify({
    type: 'join',
    username: 'john'
  }));
  
  // Send message
  ws.send(JSON.stringify({
    type: 'message',
    text: 'Hello everyone!'
  }));
  
  // Show typing indicator
  ws.send(JSON.stringify({
    type: 'typing',
    isTyping: true
  }));
};
```

## Handshake-Only Validation

If you only want to validate handshake params (not messages):

```typescript
const routes = {
  notifications: defineRoute({
    kind: 'ws',
    input: z.object({
      userId: z.string(),
      token: z.string()
    }),
    handler: {
      onMessage: async (message, connection) => {
        // message is not validated (any type)
        // Handle any message format
        console.log('Received:', message);
      }
    }
  })
};

// Handshake params validated
const ws = new WebSocket('ws://localhost:3000/api/notifications?userId=123&token=abc');

// Messages not validated
ws.send(JSON.stringify({ anything: 'goes' }));
ws.send('plain text');
ws.send({ random: { nested: { data: true } } });
```

## Message-Only Validation

If you don't need handshake validation, omit `input` or use an empty schema:

```typescript
const routes = {
  echo: defineRoute({
    kind: 'ws',
    // No input validation
    handler: {
      onMessage: async (message, connection) => {
        // message is any type
        connection.send({ echo: message });
      }
    }
  })
};

// No query params needed
const ws = new WebSocket('ws://localhost:3000/api/echo');

// Any message format works
ws.send(JSON.stringify({ anything: 'works' }));
```

## Validation Error Handling

Handle validation errors gracefully:

```typescript
// Client side
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'error') {
    if (data.code === 'VALIDATION_ERROR') {
      console.error('Invalid message format:', data.details);
      // Show user-friendly error
      alert('Please check your message format');
    } else {
      console.error('Server error:', data.message);
    }
  } else {
    // Handle normal message
    console.log('Received:', data);
  }
};
```

## Key Points

1. **`input` schema validates both** handshake params and messages
2. **Handshake validation** happens when connection opens
3. **Message validation** happens for each incoming message
4. **Invalid handshake** → Connection rejected
5. **Invalid message** → Error sent, connection stays open
6. **Use discriminated unions** for multiple message types
7. **TypeScript gets full type safety** from your schemas

## What's Next?

Now let's learn how to use hooks with WebSocket routes!

---

**Next:** [23-websocket-with-hooks.md](./23-websocket-with-hooks.md)
