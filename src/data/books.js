const { Client } = require('@notionhq/client');
const { google } = require('googleapis');
const QUERIES = require('../utils/queries');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const gbooks = google.books({ version: 'v1' });


const fetchBooks = async () => {
  const queryResponse = await notion.databases.query(QUERIES.BOOKS_TO_UPDATE);
  return queryResponse.results;
}

const fetchBookMetadata = async (book) => {
  const query = book.properties.Title.title[0].plain_text;

  const response = await gbooks.volumes.list({ q: query });
  const result = response.data;

  if (!(result.totalItems > 0)) {
    console.log(`No metadata results found for book query [${query}]`);
    return;
  }

  const metadata = result.items[0];
  console.log(`metadata found for book query [${query}] with title [${metadata.volumeInfo.title}]`);
  return metadata;
}

let dontUpdate = [];

const updateBook = async (book, metadata) => {
  let updateOptions = {
    page_id: book.id,
    properties: {
      Title: {
        title: [
          {
            type: "text",
            text: {
              content:
                metadata.volumeInfo.title ||
                i.properties.Title.title[0].plain_text.replace(
                  ";",
                  ""
                ),
            },
          },
        ],
      },
      Authors: {
        multi_select: metadata.volumeInfo.authors
          .filter((x) => x)
          .map((x) => ({
            name: x.replace(",", ""),
          })),
      },
      Genres: {
        multi_select: (metadata.volumeInfo.categories || [])
          .filter((x) => x)
          .map((x) => ({
            name: x.replace(",", ""),
          })),
      },
      Description: {
        rich_text: [
          {
            text: {
              content:
                (metadata.volumeInfo.description || "").length <
                  500
                  ? metadata.volumeInfo.description || ""
                  : metadata.volumeInfo.description.substring(
                    0,
                    500
                  ) + "...",
            },
          },
        ],
      },
      Link: {
        url: metadata.volumeInfo.previewLink,
      },
      Published: {
        date: {
          start: metadata.volumeInfo.publishedDate
        }
      },
      updated: {
        checkbox: true
      }
    },
    icon: {
      emoji: "📖",
    },
  };

  if (metadata.volumeInfo.imageLinks) {
    updateOptions.icon = {
      external: {
        url: metadata.volumeInfo.imageLinks.thumbnail,
      },
    };
    updateOptions.cover = {
      external: {
        url: metadata.volumeInfo.imageLinks.thumbnail,
      },
    };
  }

  if (metadata.volumeInfo.averageRating) {
    updateOptions.properties["Rating"] = {
      number: metadata.volumeInfo.averageRating,
    };
  }

  if (metadata.volumeInfo.pageCount) {
    updateOptions.properties["Pages"] = {
      number: metadata.volumeInfo.pageCount,
    };
  }

  try {
    await notion.pages.update(updateOptions);
  } catch (e) {
    console.error(`Error on ${book.id}: [${e.status}] ${e.message}`);

    if (e.status == 409) {
      console.log("Saving conflict, scheduling retry in 3 seconds");
      setTimeout(async () => {
        try {
          console.log(`Retrying ${book.id}`);
          await notion.pages.update(updateOptions);
        } catch (e) {
          console.error(
            `Subsequent error while resolving saving conflict on ${book.id}: [${e.status}] ${e.message}`
          );
          dontUpdate.push(book.id);
        }
      }, 3000);
    } else {
      dontUpdate.push(book.id);
    }
  }
  console.log("Updated " + book.properties.Title.title[0].plain_text);
}

const updateBooks = async (books) => {
  if (books.length == 0) return;
  console.log(`updating ${books.length} books`);
  for (const book of books) {
    const metadata = await fetchBookMetadata(book);
    if (metadata) updateBook(book, metadata);
  }
}

const fetchAndUpdateBooks = async () => {
  const books = await fetchBooks();
  updateBooks(books);
}


module.exports = {
  fetchAndUpdateBooks
}