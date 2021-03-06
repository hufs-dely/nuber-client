import { SubscribeToMoreOptions } from "apollo-client";
import React from "react";
import { graphql, Mutation, MutationFn, Query } from "react-apollo";
import ReactDOM from "react-dom";
import { RouteComponentProps } from "react-router-dom";
import { toast } from "react-toastify";
import { geoCode, reverseGeoCode } from "../../mapHelpers";
import { USER_PROFILE } from "../../sharedQueries";
import {
  acceptRide,
  acceptRideVariables,
  getDrivers,
  getRides,
  reportMovement,
  reportMovementVariables,
  requestRide,
  requestRideVariables,
  userProfile
} from "../../types/api";
import HomePresenter from "./HomePresenter";
import {
  ACCEPT_RIDE,
  GET_NEARBY_DRIVERS,
  GET_NEARBY_RIDE,
  REPORT_LOCATION,
  REQUEST_RIDE,
  SUBSCRIBE_NEARBY_RIDES
} from "./HomeQueries";

interface IState {
  isMenuOpen: boolean;
  toAddress: string;
  toLat: number;
  toLng: number;
  lat: number;
  lng: number;
  distance: string;
  duration?: string;
  price?: string;
  fromAddress: string;
  isDriving: boolean;
}

interface IProps extends RouteComponentProps<any> {
  google: any;
  reportLocation: MutationFn;
}

class ProfileQuery extends Query<userProfile> {}
class NearByQueries extends Query<getDrivers> {}
class RequestRideMutation extends Mutation<requestRide, requestRideVariables> {}
class GetNearByRides extends Query<getRides> {}
class AcceptRide extends Mutation<acceptRide, acceptRideVariables> {}

class HomeContainer extends React.Component<IProps, IState> {
  public mapRef: any;
  public map: google.maps.Map;
  public userMarker: google.maps.Marker;
  public toMarker: google.maps.Marker;
  public directions: google.maps.DirectionsRenderer;
  public drivers: google.maps.Marker[];
  public state = {
    distance: "",
    duration: undefined,
    fromAddress: "",
    isDriving: true,
    isMenuOpen: false,
    lat: 0,
    lng: 0,
    price: undefined,
    toAddress: "",
    toLat: 0,
    toLng: 0
  };

  constructor(props) {
    super(props);
    this.mapRef = React.createRef();
    this.drivers = [];
  }

  public componentDidMount() {
    navigator.geolocation.getCurrentPosition(
      this.handleGeoSuccess,
      this.handleGeoError
    );
  }

  public render() {
    const {
      isMenuOpen,
      toAddress,
      price,
      distance,
      fromAddress,
      lat,
      lng,
      toLat,
      toLng,
      duration,
      isDriving
    } = this.state;
    return (
      <ProfileQuery query={USER_PROFILE} onCompleted={this.handleProfileQuery}>
        {({ data, loading }) => (
          <NearByQueries
            query={GET_NEARBY_DRIVERS}
            skip={isDriving}
            pollInterval={5000}
            onCompleted={this.handleNearByDrivers}
          >
            {() => (
              <RequestRideMutation
                mutation={REQUEST_RIDE}
                onCompleted={this.handleRideRequest}
                variables={{
                  distance,
                  dropOffAddress: toAddress,
                  dropOffLat: toLat,
                  dropOffLng: toLng,
                  duration: duration || "",
                  pickUpAddress: fromAddress,
                  pickUpLat: lat,
                  pickUpLng: lng,
                  price: Number(price) || 0
                }}
              >
                {requestRideFn => (
                  <GetNearByRides query={GET_NEARBY_RIDE} skip={!isDriving}>
                    {({ subscribeToMore, data: nearByRide }) => {
                      const rideSubscriptionOptions: SubscribeToMoreOptions = {
                        document: SUBSCRIBE_NEARBY_RIDES,
                        updateQuery: (prev, { subscriptionData }) => {
                          if (!subscriptionData.data) {
                            return prev;
                          }
                          const newObject = Object.assign({}, prev, {
                            GetNearByRide: {
                              ...prev.GetNearByRide,
                              ride: subscriptionData.data.NearbyRideSubscription
                            }
                          });
                          return newObject;
                        }
                      };
                      if (isDriving) {
                        subscribeToMore(rideSubscriptionOptions);
                      }
                      return (
                        <AcceptRide
                          mutation={ACCEPT_RIDE}
                          onCompleted={this.handleRideAcceptance}
                        >
                          {acceptRideFn => (
                            <HomePresenter
                              loading={loading}
                              isMenuOpen={isMenuOpen}
                              toggleMenu={this.toggleMenu}
                              mapRef={this.mapRef}
                              toAddress={toAddress}
                              onInputChange={this.onInputChange}
                              price={price}
                              data={data}
                              onAddressSubmit={this.onAddressSubmit}
                              requestRideFn={requestRideFn}
                              nearByRide={nearByRide}
                              acceptRideFn={acceptRideFn}
                            />
                          )}
                        </AcceptRide>
                      );
                    }}
                  </GetNearByRides>
                )}
              </RequestRideMutation>
            )}
          </NearByQueries>
        )}
      </ProfileQuery>
    );
  }

  public toggleMenu = () => {
    this.setState(state => {
      return {
        isMenuOpen: !state.isMenuOpen
      };
    });
  };

  public handleGeoSuccess = (position: Position) => {
    const {
      coords: { latitude, longitude }
    } = position;
    this.setState({
      lat: latitude,
      lng: longitude
    });
    this.getFromAddress(latitude, longitude);
    this.loadMap(latitude, longitude);
  };

  public getFromAddress = async (lat: number, lng: number) => {
    const address = await reverseGeoCode(lat, lng);
    if (address) {
      this.setState({
        fromAddress: address
      });
    }
  };

  public loadMap = (lat, lng) => {
    const { google } = this.props;
    const maps = google.maps;
    const mapNode = ReactDOM.findDOMNode(this.mapRef.current);
    if (!mapNode) {
      this.loadMap(lat, lng);
      return;
    }
    const mapConfig: google.maps.MapOptions = {
      center: {
        lat,
        lng
      },
      disableDefaultUI: true,
      zoom: 15
    };
    this.map = new maps.Map(mapNode, mapConfig);
    const userMarkerOptions: google.maps.MarkerOptions = {
      icon: {
        path: maps.SymbolPath.CIRCLE,
        scale: 7
      },
      position: {
        lat,
        lng
      }
    };
    this.userMarker = new maps.Marker(userMarkerOptions);
    this.userMarker.setMap(this.map);
    const watchOptions: PositionOptions = {
      enableHighAccuracy: true
    };
    navigator.geolocation.watchPosition(
      this.handleGeoWatchSuccess,
      this.handleGeoWatchError,
      watchOptions
    );
  };

  public handleGeoWatchSuccess = (position: Position) => {
    const { reportLocation } = this.props;
    const {
      coords: { latitude, longitude }
    } = position;
    this.userMarker.setPosition({ lat: latitude, lng: longitude });
    this.map.panTo({ lat: latitude, lng: longitude });
    reportLocation({
      variables: {
        lat: latitude,
        lng: longitude
      }
    });
  };

  public handleGeoWatchError = () => {
    console.log("Error watching you");
  };

  public handleGeoError = () => {
    console.log("No location");
  };

  public onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const {
      target: { name, value }
    } = event;
    this.setState({
      [name]: value
    } as any);
  };

  public onAddressSubmit = async () => {
    const { toAddress } = this.state;
    const { google } = this.props;
    const maps = google.maps;
    const result = await geoCode(toAddress);
    if (result !== false) {
      const { lat, lng, formatted_address: formatedAddress } = result;
      if (this.toMarker) {
        this.toMarker.setMap(null);
      }
      const toMarkerOptions: google.maps.MarkerOptions = {
        position: {
          lat,
          lng
        }
      };
      this.toMarker = new maps.Marker(toMarkerOptions);
      this.toMarker.setMap(this.map);
      const bounds = new maps.LatLngBounds();
      bounds.extend({ lat, lng });
      bounds.extend({ lat: this.state.lat, lng: this.state.lng });
      this.map.fitBounds(bounds);
      this.setState(
        {
          toAddress: formatedAddress,
          toLat: lat,
          toLng: lng
        },
        this.createPath
      );
    }
  };

  public createPath = () => {
    const { toLat, toLng, lat, lng } = this.state;
    if (this.directions) {
      this.directions.setMap(null);
    }
    const renderOptions: google.maps.DirectionsRendererOptions = {
      polylineOptions: {
        strokeColor: "#800000"
      },
      suppressMarkers: true
    };
    this.directions = new google.maps.DirectionsRenderer(renderOptions);
    const directionsService: google.maps.DirectionsService = new google.maps.DirectionsService();
    const to = new google.maps.LatLng(toLat, toLng);
    const from = new google.maps.LatLng(lat, lng);
    const directionsOptions: google.maps.DirectionsRequest = {
      destination: to,
      origin: from,
      travelMode: google.maps.TravelMode.TRANSIT
    };
    directionsService.route(directionsOptions, this.handleRouteRequest);
  };

  public handleRouteRequest = (
    result: google.maps.DirectionsResult,
    status: google.maps.DirectionsStatus
  ) => {
    if (status === google.maps.DirectionsStatus.OK) {
      const { routes } = result;
      const {
        distance: { text: distance },
        duration: { text: duration }
      } = routes[0].legs[0];
      this.directions.setDirections(result);
      this.directions.setMap(this.map);
      this.setState(
        {
          distance,
          duration
        },
        this.setPrice
      );
    } else {
      toast.error("There is no route there, you have to ");
    }
  };

  public setPrice = () => {
    // set price by straight distance calculated by lat, lng

    const { distance } = this.state;
    const straightDistance: number = this.getStraightDistance();
    const defaultPriceInsideSchool: number = 1300;
    const defaultPriceOutsideSchool: number = 2000;

    if (straightDistance) {
      console.log(distance);
      console.log(straightDistance);

      // within 2.5km ( inside of the school )
      // 0.28 won per meter
      if (straightDistance < 2.5) {
        this.setState({
          price: (
            defaultPriceInsideSchool +
            straightDistance * 1000 * 0.28
          ).toFixed(0)
        });
      } else {
        // over 2.5km ( outside of the school )
        // 50 won per kilometer
        this.setState({
          price: (defaultPriceOutsideSchool + straightDistance * 50).toFixed(0)
        });
      }
    }
  };

  public getStraightDistance = () => {
    const { lat, lng, toLat, toLng } = this.state;
    const R = 6371;
    const dLat = this.deg2Rad(toLat - lat);
    const dLng = this.deg2Rad(toLng - lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2Rad(lat)) *
        Math.cos(this.deg2Rad(toLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  };

  public deg2Rad = deg => {
    return deg * (Math.PI / 180);
  };

  public handleNearByDrivers = (data: {} | getDrivers) => {
    if ("GetNearByDrivers" in data) {
      const {
        GetNearByDrivers: { drivers, ok }
      } = data;
      if (ok && drivers) {
        for (const driver of drivers) {
          if (driver && driver.lastLat && driver.lastLng) {
            const existingDriver:
              | google.maps.Marker
              | undefined = this.drivers.find(
              (driverMarker: google.maps.Marker) => {
                const markerID = driverMarker.get("ID");
                return markerID === driver.id;
              }
            );

            if (existingDriver) {
              existingDriver.setPosition({
                lat: driver.lastLat,
                lng: driver.lastLng
              });
              existingDriver.setMap(this.map);
            } else {
              const markerOptions: google.maps.MarkerOptions = {
                icon: {
                  path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                  scale: 4
                },
                position: {
                  lat: driver.lastLat,
                  lng: driver.lastLng
                }
              };
              const newMarker: google.maps.Marker = new google.maps.Marker(
                markerOptions
              );
              this.drivers.push(newMarker);
              newMarker.set("ID", driver.id);
              newMarker.setMap(this.map);
            }
          }
        }
      }
    }
  };

  public handleRideRequest = (data: requestRide) => {
    const { history } = this.props;
    const { RequestRide } = data;
    if (RequestRide.ok) {
      toast.success("Drive requested, finding a driver");
      history.push(`/ride/${RequestRide.ride!.id}`);
    } else {
      toast.error(RequestRide.error);
    }
  };

  public handleProfileQuery = (data: userProfile) => {
    const { GetMyProfile } = data;
    if (GetMyProfile.user) {
      const {
        user: { isDriving }
      } = GetMyProfile;
      if (isDriving) {
        this.setState({
          isDriving
        });
      }
    }
  };

  public handleRideAcceptance = (data: acceptRide) => {
    const { history } = this.props;
    const { UpdateRideStatus } = data;
    if (UpdateRideStatus.ok) {
      history.push(`/ride/${UpdateRideStatus.rideId}`);
    }
  };
}

export default graphql<any, reportMovement, reportMovementVariables>(
  REPORT_LOCATION,
  {
    name: "reportLocation"
  }
)(HomeContainer);
