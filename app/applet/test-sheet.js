import https from 'https';

https.get('https://docs.google.com/spreadsheets/d/1t9EOXyRMcyX-bzkHCO_wr4HNmSmSm3VJoQNDsEIJcBU/gviz/tq?tqx=out:json', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(data.substring(0, 200));
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
