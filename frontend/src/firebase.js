import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCEzvwVe41O3b0R5T5vioeU3gvYbfAG7OM",
    authDomain: "drconsultancy-472cb.firebaseapp.com",
    projectId: "drconsultancy-472cb",
    storageBucket: "drconsultancy-472cb.firebasestorage.app",
    messagingSenderId: "504163694907",
    appId: "1:504163694907:web:978ce95e19a026585e9f1e",
    measurementId: "G-N535Y2N3C0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });