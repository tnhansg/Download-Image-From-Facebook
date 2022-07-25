import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import { FB_API_HOST } from "./constants.js";
import { ACCESS_TOKEN } from "../config.js";

// Dùng FB API lấy link hình ảnh có độ phân giải lớn nhất từ id ảnh truyền vào
// Trả về undefined nếu không tìm thấy
export const getLargestPhotoLink = async (photo_id) => {
  let url = `${FB_API_HOST}/${photo_id}?fields=largest_image&access_token=${ACCESS_TOKEN}`;
  const json = await myFetch(url);
  return json?.largest_image?.source;
};

export const myFetch = async (_url) => {
  try {
    const response = await fetch(_url);
    const json = await response.json();
    if (json.error) {
      console.log("[!] ERROR", JSON.stringify(json, null, 4));
      return null;
    }
    return json;
  } catch (e) {
    console.log("[!] ERROR", e.toString());
    return null;
  }
};

export const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const checkFileExist = (fileDir) => fs.existsSync(fileDir);

export const deleteFile = (fileDir) =>
  checkFileExist(fileDir) && fs.unlinkSync(fileDir);

export const createIfNotExistDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`> Đã tạo thư mục ${dir}.`);
  }
};

export const saveToFile = (fileName, data, override = false) => {
  try {
    fs.writeFileSync(fileName, data, { flag: override ? "w+" : "a+" });
    console.log(`> Đã lưu vào file ${fileName}`);
  } catch (err) {
    console.error("[!] ERROR: ", err);
  }
};

export const download = (url, destination) =>
  new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve(true));
        });
      })
      .on("error", (error) => {
        fs.unlinkSync(destination);
        reject(error.message);
      });
  });
