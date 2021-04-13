const axios = require('axios');

(async () => {
  try {
    let data = await axios.get(`http://localhost:3333`);
    if (data.status !== 200) process.exit(1);
    if (data.data.healthy) process.exit(0);
    process.exit(1);
  } catch (err) {
    process.exit(1);
  }
})();
