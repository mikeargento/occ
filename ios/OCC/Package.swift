// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "OCC",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "OCC",
            targets: ["OCC"]
        ),
    ],
    targets: [
        .target(
            name: "OCC",
            path: "Sources/OCC"
        ),
    ]
)
