
const BOOKS_DATABASE_ID = process.env.NOTION_BOOKS_DB_ID;
const TUBES_DATABASE_ID = process.env.NOTION_TUBES_DB_ID;

const QUERIES = {
  BOOKS_TO_UPDATE: {
    database_id: BOOKS_DATABASE_ID,
    page_size: 100,
    filter: {
      and: [
        {
          property: "updated",
          checkbox: {
            equals: false,
          },
        },
        {
          property: "Title",
          rich_text: {
            // contains: ";"
            is_not_empty: true,
          }
        }
      ]
    }
  },
  TUBES_TO_UPDATE: {
    database_id: TUBES_DATABASE_ID,
    page_size: 100,
    filter: {
      and: [
        {
          property: "updated",
          checkbox: {
            equals: false,
          },
        },
        {
          property: "URL",
          url: {
            is_not_empty: true,
          },
        },
      ],
    }
  }
}

module.exports = QUERIES
