import { z } from 'zod';
import { defineRoute } from '../core/bridge';

/**
 * Example WebSocket chat routes
 */
export const chatRoutes = {
  // WebSocket chat room
  chatRoom: defineRoute({
    method: 'GET',
    kind: 'ws',
    input: z.object({
      message: z.string().min(1).max(500),
    }),
    description: 'WebSocket chat room',
    tags: ['chat', 'websocket'],
    handler: {
      onOpen: async (connection) => {
        console.log(`Connection opened: ${connection.id}`);
        connection.send({
          type: 'welcome',
          message: 'Welcome to the chat room!',
          timestamp: Date.now(),
        });
      },
      onMessage: async (message, connection) => {
        console.log(`Received message:`, message);
        
        // Echo the message back
        connection.send({
          type: 'echo',
          data: message,
          timestamp: Date.now(),
        });
      },
      onClose: async (connection, code, reason) => {
        console.log(`Connection closed: ${code} ${reason}`);
      },
      onError: async (connection, error) => {
        console.error('WebSocket error:', error);
      },
    },
  }),
};

