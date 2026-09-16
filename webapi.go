package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"pixtorio/internal/pixio"
)

const webAPIAddress = "127.0.0.1:17353"

func (a *App) startWebAPI() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/pixio/encode", a.webEncodePixio)
	mux.HandleFunc("/api/pixio/decode", a.webDecodePixio)
	go func() { _ = http.ListenAndServe(webAPIAddress, mux) }()
}

func (a *App) webEncodePixio(writer http.ResponseWriter, request *http.Request) {
	if !allowWebAPI(writer, request) {
		return
	}
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, 64<<20))
	if err != nil {
		webAPIError(writer, http.StatusRequestEntityTooLarge, err)
		return
	}
	document, err := decodePixioDocument(string(data))
	if err != nil {
		webAPIError(writer, http.StatusBadRequest, err)
		return
	}
	path, err := writeWebPixio(document)
	if err != nil {
		webAPIError(writer, http.StatusInternalServerError, err)
		return
	}
	defer os.Remove(path)
	encoded, err := os.ReadFile(path)
	if err != nil {
		webAPIError(writer, http.StatusInternalServerError, err)
		return
	}
	writer.Header().Set("Content-Type", "application/octet-stream")
	writer.Header().Set("Content-Disposition", "attachment; filename=project.pixio")
	_, _ = writer.Write(encoded)
}

func (a *App) webDecodePixio(writer http.ResponseWriter, request *http.Request) {
	if !allowWebAPI(writer, request) {
		return
	}
	if request.Method != http.MethodPost {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	file, err := os.CreateTemp("", "pixtorio-web-*.pixio")
	if err != nil {
		webAPIError(writer, http.StatusInternalServerError, err)
		return
	}
	path := file.Name()
	defer os.Remove(path)
	defer file.Close()
	if _, err := io.Copy(file, http.MaxBytesReader(writer, request.Body, 64<<20)); err != nil {
		webAPIError(writer, http.StatusRequestEntityTooLarge, err)
		return
	}
	if err := file.Close(); err != nil {
		webAPIError(writer, http.StatusInternalServerError, err)
		return
	}
	document, _, err := pixio.ReadFile(path)
	if err != nil {
		webAPIError(writer, http.StatusBadRequest, err)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(document)
}

func writeWebPixio(document pixio.Document) (string, error) {
	file, err := os.CreateTemp("", "pixtorio-web-*.pixio")
	if err != nil {
		return "", err
	}
	path := file.Name()
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	if err := pixio.WriteFile(path, document, nil); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func allowWebAPI(writer http.ResponseWriter, request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin != "" && !strings.HasPrefix(origin, "http://127.0.0.1:") && !strings.HasPrefix(origin, "http://localhost:") {
		writer.WriteHeader(http.StatusForbidden)
		return false
	}
	if origin != "" {
		writer.Header().Set("Access-Control-Allow-Origin", origin)
		writer.Header().Set("Vary", "Origin")
	}
	writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return false
	}
	return true
}

func webAPIError(writer http.ResponseWriter, status int, err error) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": fmt.Sprint(err)})
}
