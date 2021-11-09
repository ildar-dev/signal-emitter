const http = require("http");

const server = http.createServer((request, response) => {
    let data = '';

    if (request.method === "GET") {
        data = 'hello';
    } else if (request.method === "POST") {
        let data = '';

        request.on('data', (chunk) => {
            data += chunk;
        });

        request.on('end', () => {
            console.log(data);
        })
    }

    response.end(data);
});

console.log('start');
server.listen(1222, '172.17.0.1');