# Tutorial 19: Practical Example - Live Order Tracking

Let's build a real-world feature: live order tracking for an e-commerce site. Customers can watch their order status update in real-time.

## The Scenario

When a customer places an order, they want to see live updates:
1. Order confirmed
2. Payment processing
3. Payment successful
4. Preparing order
5. Order shipped
6. Out for delivery
7. Delivered

We'll use SSE to push these updates to the customer's browser.

## Step 1: Helper Functions

First, let's create helper functions to simulate order processing:

```typescript
// helpers/orders.ts

interface Order {
  id: string;
  userId: string;
  status: string;
  items: Array<{ name: string; quantity: number }>;
  total: number;
}

// Simulate getting order from database
export async function getOrder(orderId: string): Promise<Order | null> {
  // In real app: return await db.orders.findById(orderId);
  return {
    id: orderId,
    userId: 'user-123',
    status: 'pending',
    items: [
      { name: 'Laptop', quantity: 1 },
      { name: 'Mouse', quantity: 2 }
    ],
    total: 1299.99
  };
}

// Simulate checking if user owns this order
export async function userOwnsOrder(userId: string, orderId: string): Promise<boolean> {
  const order = await getOrder(orderId);
  return order?.userId === userId;
}

// Order status progression
const ORDER_STATUSES = [
  { status: 'confirmed', message: 'Order confirmed', delay: 1000 },
  { status: 'processing_payment', message: 'Processing payment', delay: 2000 },
  { status: 'payment_successful', message: 'Payment successful', delay: 1000 },
  { status: 'preparing', message: 'Preparing your order', delay: 3000 },
  { status: 'shipped', message: 'Order shipped', delay: 2000 },
  { status: 'out_for_delivery', message: 'Out for delivery', delay: 3000 },
  { status: 'delivered', message: 'Delivered!', delay: 0 }
];

// Simulate order status updates
export async function* trackOrderUpdates(orderId: string) {
  for (const statusUpdate of ORDER_STATUSES) {
    // Wait before sending next update
    if (statusUpdate.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, statusUpdate.delay));
    }
    
    // In real app: update database
    // await db.orders.update(orderId, { status: statusUpdate.status });
    
    yield {
      orderId,
      status: statusUpdate.status,
      message: statusUpdate.message,
      timestamp: new Date().toISOString()
    };
    
    // Stop after delivered
    if (statusUpdate.status === 'delivered') {
      break;
    }
  }
}
```

## Step 2: Authentication Hook

Create a hook to verify the user is logged in:

```typescript
// hooks/auth.ts
import { defineHook } from '../server/core/bridge';
import jwt from 'jsonwebtoken';

export const authHook = defineHook({
  name: 'auth',
  before: async (ctx) => {
    // Get token from Authorization header
    const token = ctx.req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return {
        next: false,
        status: 401,
        error: 'Please log in to track your order'
      };
    }
    
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
        email: string;
      };
      
      // Save user info in context for handler to use
      ctx.context.userId = decoded.userId;
      ctx.context.email = decoded.email;
      
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

## Step 3: Order Ownership Hook

Create a hook to verify the user owns the order they're tracking:

```typescript
// hooks/orderOwnership.ts
import { defineHook } from '../server/core/bridge';
import { userOwnsOrder } from '../helpers/orders';

export const orderOwnershipHook = defineHook({
  name: 'orderOwnership',
  before: async (ctx) => {
    const userId = ctx.context.userId;
    const orderId = ctx.input.orderId;
    
    // Check if user owns this order
    const owns = await userOwnsOrder(userId, orderId);
    
    if (!owns) {
      return {
        next: false,
        status: 403,
        error: 'You can only track your own orders'
      };
    }
    
    return { next: true };
  }
});
```

## Step 4: Logging Hook

Create a hook to log when users start/stop tracking:

```typescript
// hooks/logger.ts
import { defineHook } from '../server/core/bridge';

export const trackingLoggerHook = defineHook({
  name: 'trackingLogger',
  before: (ctx) => {
    console.log(`📦 User ${ctx.context.userId} started tracking order ${ctx.input.orderId}`);
    ctx.context.startTime = Date.now();
    return { next: true };
  },
  cleanup: (ctx) => {
    const duration = Date.now() - ctx.context.startTime;
    console.log(`📦 User ${ctx.context.userId} stopped tracking order ${ctx.input.orderId} after ${duration}ms`);
    return { next: true };
  }
});
```

## Step 5: The SSE Route

Now put it all together:

```typescript
// routes/orders.ts
import { defineRoute } from '../server/core/bridge';
import { z } from 'zod';
import { authHook } from '../hooks/auth';
import { orderOwnershipHook } from '../hooks/orderOwnership';
import { trackingLoggerHook } from '../hooks/logger';
import { getOrder, trackOrderUpdates } from '../helpers/orders';

export const orderRoutes = {
  trackOrder: defineRoute({
    kind: 'sse',
    
    // Validate input
    input: z.object({
      orderId: z.string().min(1, 'Order ID is required')
    }),
    
    // Apply hooks in order
    hooks: [
      authHook,              // 1. Check if user is logged in
      orderOwnershipHook,    // 2. Check if user owns this order
      trackingLoggerHook     // 3. Log tracking activity
    ],
    
    // Stream order updates
    handler: async function* ({ orderId }, context) {
      try {
        // Get initial order info
        const order = await getOrder(orderId);
        
        if (!order) {
          yield {
            type: 'error',
            message: 'Order not found'
          };
          return;
        }
        
        // Send initial order info
        yield {
          type: 'order_info',
          order: {
            id: order.id,
            items: order.items,
            total: order.total
          }
        };
        
        // Stream status updates
        for await (const update of trackOrderUpdates(orderId)) {
          yield {
            type: 'status_update',
            ...update
          };
          
          // If delivered, we're done
          if (update.status === 'delivered') {
            yield {
              type: 'complete',
              message: 'Order tracking complete'
            };
            break;
          }
        }
        
      } catch (error) {
        yield {
          type: 'error',
          message: error.message
        };
      }
    }
  })
};
```

## Step 6: Client Side - Simple HTML/JS

```html
<!DOCTYPE html>
<html>
<head>
  <title>Track My Order</title>
  <style>
    .status-update {
      padding: 10px;
      margin: 10px 0;
      border-left: 4px solid #4CAF50;
      background: #f0f0f0;
    }
    .error {
      border-left-color: #f44336;
      background: #ffebee;
    }
  </style>
</head>
<body>
  <h1>Track Your Order</h1>
  
  <div id="order-info"></div>
  <div id="status-updates"></div>
  
  <script>
    // Get order ID from URL (e.g., ?orderId=abc123)
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');
    
    // Get auth token from localStorage
    const token = localStorage.getItem('authToken');
    
    if (!orderId) {
      alert('No order ID provided');
    } else if (!token) {
      alert('Please log in first');
    } else {
      // Connect to SSE endpoint
      const eventSource = new EventSource(
        `/api/trackOrder?orderId=${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      // Handle messages
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'order_info') {
          // Show order details
          document.getElementById('order-info').innerHTML = `
            <h2>Order #${data.order.id}</h2>
            <p>Total: $${data.order.total}</p>
            <ul>
              ${data.order.items.map(item => 
                `<li>${item.name} x ${item.quantity}</li>`
              ).join('')}
            </ul>
          `;
        } 
        else if (data.type === 'status_update') {
          // Add status update
          const statusDiv = document.createElement('div');
          statusDiv.className = 'status-update';
          statusDiv.innerHTML = `
            <strong>${data.message}</strong>
            <br>
            <small>${new Date(data.timestamp).toLocaleTimeString()}</small>
          `;
          document.getElementById('status-updates').appendChild(statusDiv);
        }
        else if (data.type === 'complete') {
          // Order delivered!
          const completeDiv = document.createElement('div');
          completeDiv.className = 'status-update';
          completeDiv.innerHTML = `
            <strong>🎉 ${data.message}</strong>
          `;
          document.getElementById('status-updates').appendChild(completeDiv);
          
          // Close connection
          eventSource.close();
        }
        else if (data.type === 'error') {
          // Show error
          const errorDiv = document.createElement('div');
          errorDiv.className = 'status-update error';
          errorDiv.innerHTML = `<strong>Error: ${data.message}</strong>`;
          document.getElementById('status-updates').appendChild(errorDiv);
          
          // Close connection
          eventSource.close();
        }
      };
      
      // Handle connection errors
      eventSource.onerror = (error) => {
        console.error('Connection error:', error);
        document.getElementById('status-updates').innerHTML += `
          <div class="status-update error">
            <strong>Connection lost. Please refresh the page.</strong>
          </div>
        `;
        eventSource.close();
      };
    }
  </script>
</body>
</html>
```

## Step 7: Setup the Server

```typescript
// server.ts
import express from 'express';
import { setupBridge } from './server/core/bridge';
import { orderRoutes } from './routes/orders';

const app = express();

// Setup bridge
const { middleware } = setupBridge(orderRoutes, {
  prefix: '/api',
  logRequests: true
});

// Use middleware
app.use('/api/:route', middleware);

// Serve HTML page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
```

## How It All Works Together

1. **User opens tracking page** → `http://localhost:3000?orderId=abc123`
2. **Client connects to SSE** → `/api/trackOrder?orderId=abc123`
3. **authHook runs** → Checks JWT token, extracts userId
4. **orderOwnershipHook runs** → Verifies user owns this order
5. **trackingLoggerHook runs** → Logs tracking started
6. **Handler starts streaming** → Sends order info, then status updates
7. **Client receives updates** → Displays each status in real-time
8. **Order delivered** → Handler sends complete event, stream ends
9. **trackingLoggerHook cleanup** → Logs tracking stopped

## Key Takeaways

- **Hooks run before streaming** - Perfect for auth and validation
- **Helper functions** - Keep code organized and reusable
- **Async generators** - Use `yield` to send events over time
- **Error handling** - Send errors as events, don't crash the stream
- **Cleanup hooks** - Always run, great for logging and cleanup
- **Client simplicity** - EventSource handles reconnection automatically

## What's Next?

You've learned SSE! Now let's move on to WebSockets for two-way communication.

---

**Next:** [20-introduction-to-websockets.md](./20-introduction-to-websockets.md)
