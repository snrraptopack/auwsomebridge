import type { WebSocketConnection } from './types';

// ============================================================================
// CONNECTION ID GENERATION
// ============================================================================

/**
 * Generates a unique connection ID.
 * 
 * Uses crypto.randomUUID() if available, otherwise falls back to a
 * timestamp-based ID with random suffix.
 * 
 * @returns Unique connection identifier
 * 
 * @example
 * ```typescript
 * const id = generateConnectionId();
 * console.log(id); // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateConnectionId(): string {
  // Use crypto.randomUUID() if available (Node 16.7.0+, Bun, browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback: timestamp + random hex
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `ws-${timestamp}-${randomPart}`;
}

// ============================================================================
// WEBSOCKET CONNECTION WRAPPER
// ============================================================================

/**
 * Configuration for creating a WebSocketConnectionImpl instance.
 * 
 * @template TContext - Type of the hook-populated context object
 */
export interface WebSocketConnectionConfig<TContext = any> {
  /** Unique connection identifier */
  id: string;
  /** Client IP address (if available) */
  ip?: string;
  /** Request headers from WebSocket handshake */
  headers: Record<string, string | string[] | undefined>;
  /** Hook-populated context object */
  context: TContext;
  /** Native platform WebSocket */
  raw: any;
  /** Function to send messages to the client */
  sendFn: (data: any, compress?: boolean) => number | void;
  /** Function to close the connection */
  closeFn: (code?: number, reason?: string) => void;
}

/**
 * Runtime-agnostic WebSocket connection implementation.
 * 
 * This class wraps platform-specific WebSocket implementations (Express ws,
 * Hono WebSocket, Bun ServerWebSocket) into a unified interface that works
 * identically across all runtimes.
 * 
 * @template TContext - Type of the hook-populated context object
 * 
 * @example
 * ```typescript
 * // Express (ws library)
 * const connection = new WebSocketConnectionImpl({
 *   id: generateConnectionId(),
 *   ip: req.socket.remoteAddress,
 *   headers: req.headers,
 *   context: { userId: '123' },
 *   raw: ws,
 *   sendFn: (data) => ws.send(data),
 *   closeFn: (code, reason) => ws.close(code, reason)
 * });
 * 
 * // Bun
 * const connection = new WebSocketConnectionImpl({
 *   id: ws.data.connectionId,
 *   ip: ws.remoteAddress,
 *   headers: ws.data.headers,
 *   context: ws.data.context,
 *   raw: ws,
 *   sendFn: (data, compress) => ws.send(data, compress),
 *   closeFn: (code, reason) => ws.close(code, reason)
 * });
 * ```
 */
export class WebSocketConnectionImpl<TContext = any> implements WebSocketConnection<TContext> {
  readonly id: string;
  readonly ip?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly context: TContext;
  readonly raw: any;
  
  private sendFn: (data: any, compress?: boolean) => number | void;
  private closeFn: (code?: number, reason?: string) => void;
  
  /**
   * Creates a new WebSocket connection wrapper.
   * 
   * @param config - Connection configuration
   */
  constructor(config: WebSocketConnectionConfig<TContext>) {
    this.id = config.id;
    this.ip = config.ip;
    this.headers = config.headers;
    this.context = config.context;
    this.raw = config.raw;
    this.sendFn = config.sendFn;
    this.closeFn = config.closeFn;
  }
  
  /**
   * Sends a message to the client.
   * 
   * Automatically serializes objects to JSON. Strings and binary data are sent as-is.
   * 
   * @param data - Message data (string, object, ArrayBuffer, TypedArray)
   * @param compress - Enable compression for this message (Bun only)
   * 
   * @example
   * ```typescript
   * connection.send({ type: 'notification', message: 'Hello' });
   * connection.send('Plain text message');
   * connection.send(new Uint8Array([1, 2, 3]));
   * 
   * // Bun: enable compression
   * connection.send(largeObject, true);
   * ```
   */
  send(data: any, compress?: boolean): void {
    // Serialize objects to JSON, send strings and binary data as-is
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.sendFn(message, compress);
  }
  
  /**
   * Closes the WebSocket connection.
   * 
   * @param code - WebSocket close code (default: 1000 = normal closure)
   * @param reason - Human-readable close reason
   * 
   * @example
   * ```typescript
   * connection.close(); // Normal closure
   * connection.close(1008, 'Policy violation');
   * connection.close(1011, 'Internal server error');
   * ```
   */
  close(code?: number, reason?: string): void {
    this.closeFn(code, reason);
  }
}

