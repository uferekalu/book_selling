import { createSlice } from "@reduxjs/toolkit";

/** Whether the cart drawer is open (opened by "Add to cart" anywhere on the site). */
export const cartUiSlice = createSlice({
  name: "cartUi",
  initialState: { open: false },
  reducers: {
    cartOpened(state) {
      state.open = true;
    },
    cartClosed(state) {
      state.open = false;
    },
  },
});

export const { cartOpened, cartClosed } = cartUiSlice.actions;
