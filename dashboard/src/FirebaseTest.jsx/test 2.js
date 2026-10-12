import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export default function FirebaseTest() {
  const [message, setMessage] = useState("Checking Firestore...");

  useEffect(() => {
    async function checkConnection() {
      try {
        const snapshot = await getDoc(doc(db, "system", "status"));

        if (snapshot.exists()) {
          const data = snapshot.data();
          setMessage(
            `Connected! connection=${data.connection}, device=${data.device}`
          );
        } else {
          setMessage("Connected, but the test document was not found.");
        }
      } catch (error) {
        console.error("Firestore test failed:", error);
        setMessage(`Error: ${error.code || error.message}`);
      }
    }

    checkConnection();
  }, []);

  return (
    <p style={{ padding: 12, fontFamily: "sans-serif" }}>
      {message}
    </p>
  );
}