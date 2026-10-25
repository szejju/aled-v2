export const CLOUD_NAME = "dhrqrelzy";
export const UPLOAD_PRESET = "aledart";

/**
 * Pancerny silnik wysyłki zdjęć (Canvas + Base64 + XHR), idealny m.in. dla urządzeń iOS.
 * Automatycznie skaluje obraz do max 1500px i konwertuje do JPEG.
 */
export function uploadToCloudinary(fileToUpload: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(fileToUpload);

    reader.onload = function(event) {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = function() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Nie można zainicjalizować kontekstu Canvas."));
          return;
        }

        const MAX_WIDTH = 1500;
        const MAX_HEIGHT = 1500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const byteString = atob(dataUrl.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const newBlob = new Blob([ab], { type: 'image/jpeg' });
        const safeFileName = fileToUpload.name ? fileToUpload.name : "weryfikacja.jpg";

        const formData = new FormData();
        formData.append("file", newBlob, safeFileName);
        formData.append("upload_preset", UPLOAD_PRESET);

        const xhr = new XMLHttpRequest();
        const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload?upload_preset=${UPLOAD_PRESET}`;
        xhr.open("POST", url, true);

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data.secure_url);
            } catch (e) {
              reject(new Error("Błąd odczytu danych z serwera Cloudinary."));
            }
          } else {
            reject(new Error("Błąd chmury: " + xhr.responseText));
          }
        };

        xhr.onerror = () => reject(new Error("Błąd sieci podczas wysyłania (sprawdź połączenie)."));
        xhr.send(formData);
      };

      img.onerror = () => reject(new Error("Nie udało się przetworzyć zdjęcia (zbyt duży plik lub dziwny format)."));
    };

    reader.onerror = () => reject(new Error("Przeglądarka odmówiła dostępu do pliku w pamięci."));
  });
}