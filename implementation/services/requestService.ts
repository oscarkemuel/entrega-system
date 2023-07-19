import { Request } from "express";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../../src/helpers/apiErros";
import { RequestServiceAbstract } from "../../src/services/abstract/requestServiceAbstract";
import { UpdateRequestStatus } from "../../implementation/validations/DeliveryRequest/updateRequestStatus";
import { validateSchema } from "../../src/validations";
import { ProductService } from "./productService";
import { PlaceService } from "../../src/services/placeService";
import { ICreateDeliveryRequestDTO } from "../dtos/ICreateDeliveryRequestDTO";
import { CreateRequest } from "../validations/DeliveryRequest/createReqeust";

class RequestService extends RequestServiceAbstract {
  private updateRequestStatusSchema = new UpdateRequestStatus();
  private createDeliveryRequestSchema = new CreateRequest();
  private productService = new ProductService();
  private placeService = new PlaceService();
  async create(userId: string, req: Request) {
    const schema = this.createDeliveryRequestSchema.getSchema();
    const { body: data } = await validateSchema(schema, req);

    const customer = await this.customerService.getByUserId(userId);
    const place = await this.placeService.show(data.placeId);
    const product = await this.productService.showById(data.productId);

    if (place.customerId !== customer.id) {
      throw new BadRequestError("Place does not belong to customer");
    }

    const productIsAvailable = await this.productService.productIsAvailable(
      product.id
    );
    if (!productIsAvailable) {
      throw new BadRequestError("Product is not available");
    }

    const customerResquests =
      await this.deliveryRequestRepository.showByCustomerId(customer.id);
    const customerRequestsFiltered = customerResquests.filter((request) => {
      return request.status !== "canceled";
    });
    const customerProductsPromises = customerRequestsFiltered.map(
      async (request) => {
        const product = await this.productService.showById(request.productId);
        return product;
      }
    );
    const products = await Promise.all(customerProductsPromises);

    for (let i = 0; i < products.length; i++) {
      let existingProduct = products[i];
      if (
        product.startTime! >= existingProduct.endTime! ||
        product.endTime! <= existingProduct.startTime!
      ) {
        continue;
      } else {
        throw new BadRequestError(
          "Product is not available for you, Date colliding with existing one for you"
        );
      }
    }

    const payload = {
      status: "requested",
      delivery_time: new Date(),
      sellerId: product.sellerId,
      productId: product.id,
      placeId: place.id,
      customerId: customer.id,
    };

    const deliveryRequest = await this.deliveryRequestRepository.create(
      payload
    );

    await this.productService.updateAvailable(product.id, false);

    return deliveryRequest;
  }

  async updateStatus(userId: string, req: Request) {
    const seller = await this.sellerService.getByUserId(userId);
    const schema = this.updateRequestStatusSchema.getSchema();

    const {
      body: { status },
      params: { requestId },
    } = await validateSchema(schema, req);

    const deliveryRequest = await this.deliveryRequestRepository.showById(
      requestId
    );

    if (!deliveryRequest) {
      throw new NotFoundError("Delivery request not found");
    }

    if (deliveryRequest.sellerId !== seller.id) {
      throw new UnauthorizedError(
        "You are not allowed to update this delivery request"
      );
    }

    // requested-> confirmed || rejected -> done

    if (status === deliveryRequest.status) {
      throw new BadRequestError("Delivery request already in this status");
    }

    if (deliveryRequest.status === "done") {
      throw new BadRequestError("You are not allowed to change a done request");
    }

    if (status === "confirmed" && deliveryRequest.status !== "requested") {
      throw new BadRequestError("You are not allowed to accept this request");
    }

    if (status === "rejected" && deliveryRequest.status !== "requested") {
      throw new BadRequestError("You are not allowed to reject this request");
    }

    if (status === "done" && deliveryRequest.status !== "confirmed") {
      throw new BadRequestError(
        "You are not allowed to mark this request as done"
      );
    }

    if (status === "requested") {
      throw new BadRequestError("You are not allowed to return to pending");
    }

    const newDeliveryRequest =
      await this.deliveryRequestRepository.updateStatus(requestId, status);

    if (status === "rejected") {
      await this.productService.updateAvailable(
        deliveryRequest.productId,
        true
      );
    }

    return newDeliveryRequest;
  }

  async cancel(userId: string, id: string) {
    const deliveryRequest = await this.deliveryRequestRepository.showById(id);
    const customer = await this.customerService.getByUserId(userId);

    if (!deliveryRequest) {
      throw new NotFoundError("Delivery request not found");
    }

    if (deliveryRequest.customerId !== customer.id) {
      throw new UnauthorizedError(
        "You are not allowed to cancel this delivery request"
      );
    }

    if (deliveryRequest.status === "canceled") {
      throw new BadRequestError("Delivery request already canceled");
    }

    if (deliveryRequest.status !== "requested") {
      throw new BadRequestError(
        "You are not allowed to cancel this delivery request"
      );
    }

    await this.deliveryRequestRepository.updateStatus(id, "canceled");

    await this.productService.updateAvailable(deliveryRequest.productId, true);
  }
}

export { RequestService };
