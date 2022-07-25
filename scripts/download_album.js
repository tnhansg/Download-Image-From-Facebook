import { FB_API_HOST, S } from "./constants.js";
import {
  ACCESS_TOKEN,
  WAIT_BEFORE_NEXT_FETCH,
  ID_LINK_SEPERATOR,
  FOLDER_TO_SAVE_LINKS,
  FOLDER_TO_SAVE_ALBUM_MEDIA,
  PHOTO_FILE_FORMAT,
  WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO,
} from "../config.js";
import {
  createIfNotExistDir,
  deleteFile,
  download,
  getLargestPhotoLink,
  myFetch,
  saveToFile,
  sleep,
} from "./utils.js";

// Hàm này fetch và trả về 2 thứ:
// 1. Toàn bộ link ảnh (max 100) từ 1 vị trí (cursor) nhất định trong album ảnh. Định dạng: [[{id: .., url: ...}, ...]
// 2. Vị trí của ảnh tiếp theo (next cursor) (nếu có)
const fetchAlbumPhotosFromCursor = async ({ albumId, cursor }) => {
  // create link to fetch
  let url = `${FB_API_HOST}/${albumId}/photos?fields=largest_image&limit=100&access_token=${ACCESS_TOKEN}`;
  if (cursor) url += `&after=${cursor}`;

  const json = await myFetch(url);
  if (!json) return null;

  // return imgData + next cursor
  return {
    imgData: json.data?.map((_) => ({ id: _.id, url: _.largest_image.source })),
    nextCursor: json.paging?.cursors?.after || null,
  };
};

// Hàm này fetch về toàn bộ ảnh từ 1 album. Sử dụng hàm fetchAlbumPhotosFromCursor
// Liên tục fetch ảnh và lấy nextCursor, rồi lại fetch ảnh tiếp ở cursor mới. Liên tục cho tới khi không còn nextCursor
// Dữ liệu trả về là 1 mảng chứa dữ liệu {id, url} của từng ảnh. Có dạng [{id: .., url: ...}, {id: .., url: ...}, ...]
const fetchAlbumPhotos = async ({
  albumId,
  pageLimit = Infinity,
  fromPhotoId = null, // tải từ vị trí ảnh nào đó thay vì tải từ đầu
  pageFetchedCallback = async () => {},
}) => {
  let currentPage = 1;
  let hasNextCursor = true;
  let nextCursor = fromPhotoId
    ? Buffer.from(fromPhotoId).toString("base64")
    : null;
  let allImgsData = [];

  while (hasNextCursor && currentPage <= pageLimit) {
    console.log(`ĐANG TẢI TRANG: ${currentPage}, Kích thước trang: 100 ảnh...`);

    const data = await fetchAlbumPhotosFromCursor({
      albumId,
      cursor: nextCursor,
    });

    if (data?.imgData) {
      // concat data to result array
      allImgsData.push(...data.imgData);

      console.log(
        S.BgGreen +
          `> TÌM THẤY ${data.imgData.length} ẢNH. (TỔNG: ${allImgsData.length})` +
          S.Reset
      );

      // callback when each page fetched
      await pageFetchedCallback(data.imgData);

      // get next cursor AND increase pageNum
      nextCursor = data.nextCursor;
      hasNextCursor = nextCursor != null;
      currentPage++;

      // wait for next fetch - if needed
      if (WAIT_BEFORE_NEXT_FETCH) {
        console.log(`ĐANG TẠM DỪNG ${WAIT_BEFORE_NEXT_FETCH}ms...`);
        await sleep(WAIT_BEFORE_NEXT_FETCH);
      }
    } else {
      // FAILED => re-fetch currentPage
      console.log(S.BgRed + "[!] ERROR." + S.Reset);
      break;
    }
  }

  return allImgsData;
};

// Hàm này fetch thông tin của 1 album, bao gồm nhiều thứ như tên, loại, số lượng ảnh, ngày tạo, người tạo, ...
// Bạn có thể thêm những trường khác vào url để lấy được nhiều thông tin hơn, tìm hiểu các trường trong https://developers.facebook.com/tools/explorer/
export const fetchAlbumInfo = async (albumId) => {
  // create link to fetch
  let url = `${FB_API_HOST}/${albumId}?fields=id,from,name,type,count,link&access_token=${ACCESS_TOKEN}`;

  // fetch data
  const json = await myFetch(url);

  // return album infomation
  if (!json) return null;
  return {
    id: albumId,
    count: json.count,
    link: json.link,
    name: json.name,
  };
};

// Tải và lưu tất cả id hình ảnh + link hình ảnh từ album, lưu vào file có tên trùng với albumId, lưu trong folder links
export const downloadAlbumPhotoLinks = async ({
  albumId,
  fromPhotoId,
  isGetLargestPhoto = false,
}) => {
  const from_text = fromPhotoId
    ? "vị trí photo_id=" + fromPhotoId
    : "đầu album";
  console.log(`ĐANG TẢI DỮ LIỆU ALBUM ${albumId} TỪ ${from_text}...`);

  const fileName = `${FOLDER_TO_SAVE_LINKS}/${albumId}.txt`;
  deleteFile(fileName); // delete if file exist

  await fetchAlbumPhotos({
    albumId,
    fromPhotoId,
    pageFetchedCallback: (pageImgsData) => {
      console.log(`Đang lưu link vào file ${fileName}`);

      if (isGetLargestPhoto) {
        // TODO  gett largest photo link
      }

      saveToFile(
        fileName,
        pageImgsData.map((_) => _.id + ID_LINK_SEPERATOR + _.url).join("\n"),
        false
      );
    },
  });
};

// Tải và lưu tất cả HÌNH ẢNH từ album, lưu từng file ảnh bằng id của ảnh và lưu hết vào folder images/albumId/
export const downloadAlbumPhoto = async ({
  albumId,
  fromPhotoId,
  isGetLargestPhoto = false,
}) => {
  const from_text = fromPhotoId
    ? "vị trí photo_id=" + fromPhotoId
    : "đầu album";
  console.log(`ĐANG TẢI DỮ LIỆU ALBUM ${albumId} TỪ ${from_text}...`);
  let saved = 0;
  await fetchAlbumPhotos({
    albumId,
    fromPhotoId,
    pageFetchedCallback: async (pageImgsData) => {
      // create dir if not exist
      const dir = `${FOLDER_TO_SAVE_ALBUM_MEDIA}/${albumId}`;
      createIfNotExistDir(dir);

      // save all photo to directory
      for (let data of pageImgsData) {
        let { id: photo_id, url: photo_url } = data;

        if (isGetLargestPhoto) {
          await sleep(WAIT_BEFORE_NEXT_FETCH_LARGEST_PHOTO);
          console.log(
            `Đang tìm ảnh có độ phân giải lớn nhất của ${photo_id}...`
          );
          photo_url = (await getLargestPhotoLink(photo_id)) || photo_url;
        }

        const savePath = `${dir}/${photo_id}.${PHOTO_FILE_FORMAT}`;
        try {
          console.log(`Đang lưu ${saved}: ${savePath}...`);
          await download(photo_url, savePath);
          saved++;
        } catch (e) {
          console.log(
            S.BgRed + `[!] LỖI khi tải ảnh ${savePath}` + S.Reset,
            e.toString()
          );
        }
      }
    },
  });
};
