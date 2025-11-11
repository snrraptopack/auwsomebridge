import { $api } from './server/client-$api';

// Test what's in $api
console.log('$api keys:', Object.keys($api));
console.log('$api.ping:', typeof $api.ping);
console.log('$api.getUserById:', typeof $api.getUserById);
console.log('$api.createUser:', typeof $api.createUser);
