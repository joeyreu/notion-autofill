const { Client } = require('@notionhq/client');
const { google } = require('googleapis');
const QUERIES = require('../utils/queries');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_DATA_API_KEY });

async function checkEmbedURLInPage(pageId, url) {
  try {
    // Retrieve the page content
    const response = await notion.blocks.children.list({
      block_id: pageId,
    });

    // Check if the embedded URL is present in the content
    const blocks = response.results;
    for (const block of blocks) {
      if (block.type === 'embed' && block.embed?.url === url) {
        return true;
      }
    }

    return false; // Embedded URL not found
  } catch (error) {
    console.error('Unable to check embedded URL:', error);
    return false;
  }
}

async function insertEmbedBlock(pageId, embedLink) {
  const embedBlock = {
    object: 'block',
    type: 'embed',
    embed: {
      url: embedLink,
    },
  };

  const response = await notion.blocks.children.append({
    block_id: pageId,
    children: [embedBlock],
  });
}

async function insertCalloutBlock(pageId, content="", emoji="ℹ️") {
  const calloutBlock = {
    object: 'block',
    type: 'callout',
    callout: {
      color: 'gray_background', // background color
      icon: {
        type: 'emoji',
        emoji: emoji,
      },
      rich_text: content.split("\n").map(part => ({
        text: {
          content: part + "\n",
        }
      })),
    },
  };

  try {
    await notion.blocks.children.append({
      block_id: pageId,
      children: [calloutBlock],
    });
  } catch (e) {
    console.error("Error: Failed to insert callout block due to: ", e)
  }
}

async function insertToggleBlock(
  pageId,
  header,
  description,
  type="heading_3" // other options: toggle, heading_1, heading_2
) {
  try {
    const response = await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block',
          type: type,
          [type]: {
            color: 'gray_background', // background color
            rich_text: [
              {
                text: {
                  content: header
                }
              }
            ],
            children: [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    {
                      text: {
                        content: description
                      }
                    }
                  ]
                }
              }
            ],
            // archived: true, // Set the toggle block to be collapsed by default
          },
        },
      ],
    });

    console.log('Toggle block inserted successfully:', response);
  } catch (error) {
    console.error('Error inserting toggle block:', error);
  }
}

async function insertPageBlocks(pageId, embedLink, description) {
  if (await checkEmbedURLInPage(pageId, embedLink)) return;
  await insertEmbedBlock(pageId, embedLink);
  await insertCalloutBlock(pageId, description);
  // await insertToggleBlock(pageId, "Description", description)
}

function extractTitleFromWikipediaLink(link) {
  const regex = /\/wiki\/(.+)/;
  const match = link.match(regex);

  if (match && match[1]) {
    return decodeURIComponent(match[1]).replace(/_/g, ' ');
  } else {
    return null;
  }
}

function extractVideoId(url) {
  const regex = /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|\.be\/)([^\s&/?]{11})/;
  const match = url.match(regex);

  if (match && match[1]) {
    return match[1];
  } else {
    throw new Error('Invalid YouTube URL');
  }
}

async function fetchVideoCategoryTitle(categoryId) {
  try {
    // Make the request to retrieve the category details
    const response = await youtube.videoCategories.list({
      part: 'snippet',
      id: categoryId,
    });

    // Extract the category title from the response
    const category = response.data.items[0];
    const categoryTitle = category.snippet.title;
    return categoryTitle;
  } catch (error) {
    console.error('Unable to get youtube video category title:', error);
  }
}

async function fetchVideoTopicTitles(videoId) {
  try {
    // Make the request to retrieve video details
    const response = await youtube.videos.list({
      part: 'topicDetails',
      id: videoId,
    });

    // Extract the video topic details from the response
    const video = response.data.items[0];
    const topicCategories = video?.topicDetails?.topicCategories;
    const topicTitles = topicCategories?.map(link => extractTitleFromWikipediaLink(link));
    return topicTitles;
  } catch (error) {
    console.error('Unable to get video details:', error);
  }
}

async function fetchVideoMetadata(url) {
  try {
    // call youtube api
    const videoId = extractVideoId(url);
    const response = await youtube.videos.list({ part: 'snippet', id: videoId });
    const video = response.data.items[0];

    // extract desired metadata
    const title = video.snippet.title;
    const description = video.snippet.description;
    const thumbnailUrl = video.snippet.thumbnails.medium.url;
    const channelTitle = video.snippet.channelTitle;
    const categoryTitle = await fetchVideoCategoryTitle(video.snippet.categoryId);
    const topicTitles = await fetchVideoTopicTitles(videoId);

    const metadata =  {
      title,
      description,
      channelTitle,
      thumbnailUrl,
      categoryTitle,
      topicTitles,
      url,
    };

    console.log("metadata found for 'tube video: ", title);

    return metadata;
  } catch (error) {
    console.error("Error fetching 'tube video metadata: ", error);
  }
}


async function fetchTubes() {
  const queryResponse = await notion.databases.query(QUERIES.TUBES_TO_UPDATE);
  return queryResponse.results;
}

async function updateTube(tube, metadata) {
  let updateProps = {
    Title: {
      title: [
        {
          type: "text",
          text: {
            content: metadata.title
          },
        },
      ],
    },
    Channel: {
      select: {
        name: metadata.channelTitle
      }
    },
    Category: {
      select: {
        name: metadata.categoryTitle
      }
    },
    updated: {
      checkbox: true
    }
  };
  if (metadata.topicTitles)
    updateProps.Topics = {
      multi_select: metadata.topicTitles
          .filter((x) => x)
          .map((x) => ({
            name: x.replace(",", ""),
          })),
    }
  let updateOptions = {
    page_id: tube.id,
    properties: updateProps,
    icon: {
      external: {
        url: metadata.thumbnailUrl,
      },
    },
    cover: {
      external: {
        url: metadata.thumbnailUrl,
      },
    }
  };
  try {
    await notion.pages.update(updateOptions);
    await insertPageBlocks(tube.id, metadata.url, metadata.description);
  } catch (e) {
    console.error(`Error on ${tube.id}: [${e.status}] ${e.message}`)
  }
}

async function updateTubes(tubes) {
  if (tubes.length == 0) return;

  console.log(`updating ${tubes.length} tubes`);
  for (const tube of tubes) {
    const url = tube.properties.URL.url;
    const metadata = await fetchVideoMetadata(url);
    if (metadata) updateTube(tube, metadata);
  }
}

async function fetchAndUpdateTubes() {
  const tubes = await fetchTubes();
  updateTubes(tubes);
}

module.exports = { fetchAndUpdateTubes }