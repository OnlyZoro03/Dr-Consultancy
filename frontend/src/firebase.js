import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCEzvwVe41O3b0R5T5vioeU3gvYbfAG7OM",
    authDomain: "drconsultancy-472cb.firebaseapp.com",
    projectId: "drconsultancy-472cb",
    storageBucket: "drconsultancy-472cb.firebasestorage.app",
    messagingSenderId: "504163694907",
    appId: "1:504163694907:web:a7964a12aa347dbb5e9f1e",
    measurementId: "G-KDPY1LP1YV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();