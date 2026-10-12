import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export default function useSafetyData() {
  const [safetyData, setSafetyData] = useState({
    gas_raw: null,
    flame_detected: null,
    esp32_online: false,
    alarm_status: "CONNECTING",
  });

  const [connectionStatus, setConnectionStatus] = useState("connecting");

  useEffect(() => {
    const sensorRef = doc(
      db,
      "industrial_safety",
      "live_status"
    );

    const unsubscribe = onSnapshot(
      sensorRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSafetyData((previous) => ({
            ...previous,
            ...snapshot.data(),
          }));
          setConnectionStatus("connected");
        } else {
          setConnectionStatus("document-missing");
        }
      },
      (error) => {
        console.error("Sensor listener error:", error);
        setConnectionStatus("error");
      }
    );

    return () => unsubscribe();
  }, []);

  return { safetyData, connectionStatus };
}