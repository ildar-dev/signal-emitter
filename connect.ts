import http from 'http';
import { handler } from './brokers/index';
import { TMessage } from './types';
import { errorSerializer, serializer } from './logger';

import config from './config.json';

const server = http.createServer((request, response) => {
    let data = '';

    if (request.method === "GET") {
        data = 'GET RESPONSE';
    } else if (request.method === "POST") {
        let data = '';

        request.on('data', (chunk: string) => {
            data += chunk;
        });

        request.on('end', async () => {
          try {
            await handler(data);
          } catch(error) {
            console.error('ERROR OUT handler', serializer(error));
          }
        })
    }

    response.end(data);
});

console.log('🚀 Start listen server');
server.listen(config.sender.port, config.sender.host);