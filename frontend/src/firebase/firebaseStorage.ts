import { ref, uploadBytes, getDownloadURL, StorageError } from "firebase/storage";
import { storage } from "./firebase";
import imageCompression from "browser-image-compression";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

const optimizeImage = async (file: File): Promise<File> => {
  // Calculate target size based on original file size
  const targetSizeMB =
    file.size > MAX_FILE_SIZE
      ? 4.5 // If file is larger than 5MB, target 4.5MB to ensure we're under limit
      : file.size / (1024 * 1024); // Otherwise keep original size

  const options = {
    maxSizeMB: targetSizeMB,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 1, // Start with 80% quality
  };

  try {
    let compressedFile = await imageCompression(file, options);

    // If still too large, try again with more aggressive compression
    if (compressedFile.size > MAX_FILE_SIZE) {
      options.initialQuality = 0.6;
      compressedFile = await imageCompression(file, options);
    }

    // Final check
    if (compressedFile.size > MAX_FILE_SIZE) {
      throw new Error(`Unable to compress image below ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    return compressedFile;
  } catch (error) {
    console.error("Error compressing image:", error);
    throw error;
  }
};

export const getUserImageUrl = async (userId: string): Promise<string> => {
  // Use the same path as uploadUserImage
  try {
    const avatarRef = ref(storage, `users/${userId}/profile/avatar.webp`);
    return await getDownloadURL(avatarRef);
  } catch (error) {
    // Only log if it's not a 404, since 404s are expected when user has no avatar
    if ((error as StorageError)?.code !== "storage/object-not-found") {
      console.error("Error fetching avatar:", error);
    }
    return "";
  }
};

export const uploadUserImage = async (file: File | null, userId: string): Promise<string> => {
  const path = `users/${userId}/profile/avatar.webp`;
  const imageRef = ref(storage, path);

  try {
    // If no file, just get the URL
    if (!file) {
      return await getDownloadURL(imageRef);
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files are allowed");
    }

    // For files over 5MB, we'll try to compress them instead of rejecting immediately
    if (file.size > MAX_FILE_SIZE) {
      console.log(
        `File size (${(file.size / (1024 * 1024)).toFixed(
          2,
        )}MB) exceeds 5MB limit. Will attempt compression...`,
      );
    }

    // Optimize and convert to WebP
    const optimizedFile = await optimizeImage(file);

    // Upload the optimized WebP file
    const snapshot = await uploadBytes(imageRef, optimizedFile);
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (error) {
    console.error("Error with storage operation:", error);
    if (!file) return "";
    throw error;
  }
};
