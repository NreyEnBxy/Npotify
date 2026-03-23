const https = require('https');
https.get('https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=test', (res) => {
  console.log(res.headers);
});