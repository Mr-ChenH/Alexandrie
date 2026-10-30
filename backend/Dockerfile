# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
ARG TARGETOS
ARG TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/backend_app .

FROM gcr.io/distroless/static-debian12:nonroot AS runtime
WORKDIR /app
ENV BACKEND_PORT=8201 \
    GIN_MODE=release
COPY --from=builder --chown=nonroot:nonroot /out/backend_app ./backend_app
EXPOSE 8201
ENTRYPOINT ["./backend_app"]
