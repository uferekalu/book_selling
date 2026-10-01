import { describe, expect, it } from "vitest";
import cloudinaryLoader from "./cloudinary-loader";

describe("cloudinaryLoader", () => {
  it("adds sizing after the crop, before the version", () => {
    expect(
      cloudinaryLoader({
        src: "https://res.cloudinary.com/books/image/upload/c_crop,x_0,y_10,w_1200,h_1800/v12/book-selling/books/1/images/cover",
        width: 384,
      }),
    ).toBe(
      "https://res.cloudinary.com/books/image/upload/c_crop,x_0,y_10,w_1200,h_1800/w_384,c_limit,q_auto,f_auto,dpr_1/v12/book-selling/books/1/images/cover",
    );
  });

  it("works without a crop and honours quality", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/b/image/upload/v3/id", width: 96, quality: 60 })).toBe(
      "https://res.cloudinary.com/b/image/upload/w_96,c_limit,q_60,f_auto,dpr_1/v3/id",
    );
  });

  it("leaves other hosts alone", () => {
    expect(cloudinaryLoader({ src: "/icon.svg", width: 64 })).toBe("/icon.svg");
  });
});
