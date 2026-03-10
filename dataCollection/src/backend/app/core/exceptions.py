from fastapi import HTTPException, status


class APIException(HTTPException):

    def __init__(self, status_code: int, detail: str):
        super().__init__(
            status_code=status_code,
            detail=detail
        )


class NotFoundException(APIException):

    def __init__(self, detail: str = "Resource not found"):
        super().__init__(
            status.HTTP_404_NOT_FOUND,
            detail
        )


class UnauthorizedException(APIException):

    def __init__(self, detail: str = "Unauthorized"):
        super().__init__(
            status.HTTP_401_UNAUTHORIZED,
            detail
        )


class ForbiddenException(APIException):

    def __init__(self, detail: str = "Forbidden"):
        super().__init__(
            status.HTTP_403_FORBIDDEN,
            detail
        )


class BadRequestException(APIException):

    def __init__(self, detail: str = "Bad request"):
        super().__init__(
            status.HTTP_400_BAD_REQUEST,
            detail
        )