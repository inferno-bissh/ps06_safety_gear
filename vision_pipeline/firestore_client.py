import json
import logging
import requests
from datetime import datetime
from config import (
    FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY,
    FACILITY_ID,
    SERVICE_ACCOUNT_PATH,
)

logger = logging.getLogger("FirestoreClient")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def _py_to_firestore_value(val):
    """Converts a standard Python value to Firestore REST typed format."""
    if val is None:
        return {"nullValue": None}
    elif isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, int):
        return {"integerValue": str(val)}
    elif isinstance(val, float):
        return {"doubleValue": float(val)}
    elif isinstance(val, str):
        return {"stringValue": str(val)}
    elif isinstance(val, dict):
        fields = {k: _py_to_firestore_value(v) for k, v in val.items()}
        return {"mapValue": {"fields": fields}}
    elif isinstance(val, (list, tuple)):
        values = [_py_to_firestore_value(item) for item in val]
        return {"arrayValue": {"values": values}}
    else:
        return {"stringValue": str(val)}

class FirestoreSyncClient:
    def __init__(self, project_id=FIREBASE_PROJECT_ID, api_key=FIREBASE_API_KEY, facility_id=FACILITY_ID):
        self.project_id = project_id
        self.api_key = api_key
        self.facility_id = facility_id
        self.use_admin_sdk = False
        self.admin_db = None

        # Check if serviceAccountKey.json is available
        if SERVICE_ACCOUNT_PATH.exists():
            try:
                import firebase_admin
                from firebase_admin import credentials, firestore

                if not firebase_admin._apps:
                    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
                    firebase_admin.initialize_app(cred)
                self.admin_db = firestore.client()
                self.use_admin_sdk = True
                logger.info("[Firestore] Initialized using Firebase Admin SDK (serviceAccountKey.json).")
            except Exception as e:
                logger.warning(f"[Firestore] Could not load Firebase Admin SDK: {e}. Falling back to REST API.")

        if not self.use_admin_sdk:
            logger.info(f"[Firestore] Initialized using Cloud Firestore REST API for project: '{self.project_id}'.")

    def _rest_patch(self, doc_path: str, data: dict, use_update_mask: bool = True):
        """Writes or updates a document via Firestore REST API with updateMask support."""
        url = (
            f"https://firestore.googleapis.com/v1/projects/{self.project_id}/"
            f"databases/(default)/documents/{doc_path}"
        )
        params_list = []
        if self.api_key:
            params_list.append(("key", self.api_key))
        if use_update_mask:
            for k in data.keys():
                params_list.append(("updateMask.fieldPaths", k))

        fields = {k: _py_to_firestore_value(v) for k, v in data.items()}
        body = {"fields": fields}

        try:
            resp = requests.patch(url, params=params_list, json=body, timeout=5)
            if resp.status_code in (200, 201):
                return True
            else:
                if use_update_mask:
                    return self._rest_patch(doc_path, data, use_update_mask=False)
                logger.error(f"[Firestore REST Error] {resp.status_code}: {resp.text}")
                return False
        except Exception as e:
            logger.error(f"[Firestore REST Connection Error]: {e}")
            return False

    def push_incident(self, incident: dict) -> bool:
        """Pushes an incident to facilities/{facility_id}/incidents/{incident_id}."""
        incident_id = incident.get("incident_id")
        if not incident_id:
            logger.error("Incident missing incident_id.")
            return False

        if self.use_admin_sdk:
            try:
                doc_ref = (
                    self.admin_db.collection("facilities")
                    .document(self.facility_id)
                    .collection("incidents")
                    .document(incident_id)
                )
                doc_ref.set(incident, merge=True)
                logger.info(f"[Firestore] Pushed Incident {incident_id} ({incident.get('priority')}) successfully.")
                return True
            except Exception as e:
                logger.error(f"[Firestore Admin Error]: {e}")
                return False
        else:
            path = f"facilities/{self.facility_id}/incidents/{incident_id}"
            success = self._rest_patch(path, incident)
            if success:
                logger.info(f"[Firestore REST] Incident {incident_id} [{incident.get('priority')}] published to Cloud.")
            return success

    def update_zone_priority(self, zone_id: str, priority: str, fire_detected: bool = False, smoke_detected: bool = False):
        """Updates zone status & priority in Firestore."""
        data = {
            "current_priority": priority,
            "fire_detected": fire_detected,
            "smoke_detected": smoke_detected,
        }
        if self.use_admin_sdk:
            try:
                zone_ref = (
                    self.admin_db.collection("facilities")
                    .document(self.facility_id)
                    .collection("zones")
                    .document(zone_id)
                )
                zone_ref.update(data)
                return True
            except Exception as e:
                logger.error(f"Failed to update zone in Admin SDK: {e}")
                return False
        else:
            path = f"facilities/{self.facility_id}/zones/{zone_id}"
            return self._rest_patch(path, data)

    def push_gate_log(self, gate_log: dict) -> bool:
        """Pushes a gate check-in entry to facilities/{facility_id}/gate_logs/{log_id}."""
        log_id = gate_log.get("log_id")
        if not log_id:
            import time
            log_id = f"GATE-{int(time.time()) % 1000000:06d}"
            gate_log["log_id"] = log_id

        if self.use_admin_sdk:
            try:
                doc_ref = (
                    self.admin_db.collection("facilities")
                    .document(self.facility_id)
                    .collection("gate_logs")
                    .document(log_id)
                )
                doc_ref.set(gate_log, merge=True)
                logger.info(f"[Firestore] Pushed Gate Log {log_id} for {gate_log.get('worker_name')}.")
                return True
            except Exception as e:
                logger.error(f"[Firestore Admin Error]: {e}")
                return False
        else:
            path = f"facilities/{self.facility_id}/gate_logs/{log_id}"
            success = self._rest_patch(path, gate_log)
            if success:
                logger.info(f"[Firestore REST] Gate Log {log_id} for {gate_log.get('worker_name')} published to Cloud.")
            return success
