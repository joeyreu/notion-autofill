const dotenv = require('dotenv');
dotenv.config();

const { fetchAndUpdateBooks } = require('./src/data/books');
const { fetchAndUpdateTubes} = require('./src/data/youtube');

const intervalSeconds = 5;
function checkAndUpdateData() {
  fetchAndUpdateBooks();
  fetchAndUpdateTubes();
  // console.log(`checking & updating data (every ${intervalSeconds} seconds)`);
  // setTimeout(checkAndUpdateData, intervalSeconds * 1000);
}
checkAndUpdateData();
