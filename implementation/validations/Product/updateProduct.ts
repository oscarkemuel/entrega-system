import { z } from "zod";
import { IValidator } from "../../../src/validations/IValidator";

class UpdateProduct implements IValidator {
  getSchema() {
    const updateProductSchema = z.object({
      body: z.object({
        name: z.string({
          required_error: "Name is required",
        }),
        description: z.string({
          required_error: "Description is required",
        }),
        price: z.number({
          required_error: "Price is required",
        }),
        model: z.string({
          required_error: "Model is required",
        })
      }),
      params: z.object({
        productId: z.string({
          required_error: "productId is required",
        }).uuid("Not a valid uuid")
      })
    });

    return updateProductSchema;
  }
}

export { UpdateProduct }