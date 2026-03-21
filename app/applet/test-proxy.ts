import https from 'http';
https.get('http://localhost:3000/api/search?q=test', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data.substring(0, 100)));
});