import { http } from './http';

// A photo never changes (a new one gets a new uuid), so each is fetched once per page load
const urls = new Map();

/** Photos taken in the app, read with the session's token (an <img> can't send it) */
export const PhotoService = {
    /** An object URL for the photo, to use as an image source; the same promise for the same photo */
    getUrl(photoUuid) {
        if (!urls.has(photoUuid)) {
            const url = http.getBlob(`/photos/${photoUuid}`).then((blob) => URL.createObjectURL(blob));
            // A failed load can be tried again later
            url.catch(() => urls.delete(photoUuid));
            urls.set(photoUuid, url);
        }
        return urls.get(photoUuid);
    }
};
